/**
 * WhatsApp notification sender via OpenWA gateway.
 *
 * Universal utility — used by the notification system, newsletter campaigns,
 * and any other feature that needs to send WhatsApp messages.
 *
 * OpenWA v0.18 REST API:
 *   Text:  POST {base_url}/api/sessions/{sessionId}/messages/send-text
 *   Image: POST {base_url}/api/sessions/{sessionId}/messages/send-image
 *   Headers: { Content-Type: application/json, X-API-Key: {api_key} }
 *   Body: { chatId: "{phone}@c.us", text: "message" }
 *
 * NOTE: the legacy `/api/sendText/{sessionId}` + `apiKey` header endpoints were
 * removed before v0.18 — using them returns `Cannot POST /api/sendText/... 404`.
 */
import { readServerSecrets } from '@/lib/server-secrets-cache'

export interface WhatsAppConfig {
  base_url: string
  api_key: string
  session_id: string
  default_country_code: string
  max_concurrency: number
  send_delay_ms: number
}

export interface WhatsAppSendResult {
  success: boolean
  phone: string
  messageId?: string
  error?: string
}

let _configCache: WhatsAppConfig | null = null
let _configCacheTime = 0

async function getConfig(): Promise<WhatsAppConfig | null> {
  // Cache for 60s to avoid reading DB on every send
  if (_configCache && Date.now() - _configCacheTime < 60000) {
    return _configCache
  }

  try {
    const secrets = await readServerSecrets()
    const baseUrl = secrets.openwa_base_url?.trim()
    const apiKey = secrets.openwa_api_key?.trim()
    const sessionId = secrets.openwa_session_id?.trim()

    if (!baseUrl || !apiKey || !sessionId) {
      _configCache = null
      return null
    }

    _configCache = {
      base_url: baseUrl.replace(/\/+$/, ''),
      api_key: apiKey,
      session_id: sessionId,
      default_country_code: secrets.openwa_default_country_code?.trim() || '91',
      max_concurrency: parseInt(secrets.openwa_max_concurrency || '3') || 3,
      send_delay_ms: parseInt(secrets.openwa_send_delay_ms || '400') || 400,
    }
    _configCacheTime = Date.now()
    return _configCache
  } catch {
    return null
  }
}

/**
 * Normalize a phone number to OpenWA format.
 * Accepts: "+919876543210", "919876543210", "9876543210"
 * Returns: "919876543210@c.us"
 */
export function normalizePhone(phone: string, defaultCountryCode?: string): string | null {
  const cleaned = phone.replace(/[^0-9+]/g, '')
  if (!cleaned || cleaned.length < 7) return null

  let digits = cleaned.replace(/^\+/, '')
  // If it doesn't start with a country code, prepend the default
  if (digits.length <= 10 && defaultCountryCode) {
    digits = defaultCountryCode + digits
  }

  return `${digits}@c.us`
}

/**
 * Send a text message via WhatsApp.
 */
export async function sendWhatsAppText(
  phone: string,
  text: string,
): Promise<WhatsAppSendResult> {
  const config = await getConfig()
  if (!config) {
    return { success: false, phone, error: 'WhatsApp not configured' }
  }

  const chatId = normalizePhone(phone, config.default_country_code)
  if (!chatId) {
    return { success: false, phone, error: 'Invalid phone number' }
  }

  try {
    const url = `${config.base_url}/api/sessions/${config.session_id}/messages/send-text`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.api_key,
      },
      body: JSON.stringify({ chatId, text }),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      return { success: false, phone, error: `HTTP ${res.status}: ${errBody}` }
    }

    const data = await res.json().catch(() => ({}))
    return { success: true, phone, messageId: data.messageId || data.id || data.waMessageId }
  } catch (e) {
    return { success: false, phone, error: (e as Error).message }
  }
}

/**
 * Send a message with image via WhatsApp.
 */
export async function sendWhatsAppImage(
  phone: string,
  imageUrl: string,
  caption?: string,
): Promise<WhatsAppSendResult> {
  const config = await getConfig()
  if (!config) {
    return { success: false, phone, error: 'WhatsApp not configured' }
  }

  const chatId = normalizePhone(phone, config.default_country_code)
  if (!chatId) {
    return { success: false, phone, error: 'Invalid phone number' }
  }

  try {
    const url = `${config.base_url}/api/sessions/${config.session_id}/messages/send-image`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.api_key,
      },
      body: JSON.stringify({ chatId, url: imageUrl, caption: caption || '' }),
      signal: AbortSignal.timeout(20000),
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      return { success: false, phone, error: `HTTP ${res.status}: ${errBody}` }
    }

    const data = await res.json().catch(() => ({}))
    return { success: true, phone, messageId: data.messageId || data.id || data.waMessageId }
  } catch (e) {
    return { success: false, phone, error: (e as Error).message }
  }
}

/**
 * Send a message with buttons via WhatsApp (interactive list message).
 *
 * ponytail: OpenWA v0.18 dropped the legacy `/api/sendButtons` route and has no
 * interactive-buttons send endpoint, so this falls back to a plain text send.
 * The button text is appended to the message. If OpenWA ships a buttons route in
 * a future version, swap the body/URL for it here (single shared function).
 */
export async function sendWhatsAppButtons(
  phone: string,
  text: string,
  buttons: { id: string; text: string }[],
): Promise<WhatsAppSendResult> {
  const buttonLabels = buttons.slice(0, 3).map(b => b.text).join(', ')
  const fullText = buttonLabels ? `${text}\n\nReply with: ${buttonLabels}` : text
  return sendWhatsAppText(phone, fullText)
}

/**
 * Batch send with concurrency control and delay.
 * Returns results for each phone number.
 */
export async function sendWhatsAppBatch(
  messages: { phone: string; text: string }[],
  options?: { concurrency?: number; delayMs?: number },
): Promise<WhatsAppSendResult[]> {
  const config = await getConfig()
  const concurrency = options?.concurrency || config?.max_concurrency || 3
  const delayMs = options?.delayMs || config?.send_delay_ms || 400

  const results: WhatsAppSendResult[] = []

  for (let i = 0; i < messages.length; i += concurrency) {
    const batch = messages.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      batch.map(m => sendWhatsAppText(m.phone, m.text))
    )
    results.push(...batchResults)

    // Delay between batches
    if (i + concurrency < messages.length && delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }

  return results
}

/**
 * Check if WhatsApp is configured and ready.
 */
export async function isWhatsAppConfigured(): Promise<boolean> {
  const config = await getConfig()
  return config !== null
}

export interface WhatsAppConnectionStatus {
  ok: boolean
  reachedGateway: boolean
  sessionId?: string
  sessionStatus?: string
  sessionName?: string
  phone?: string
  error?: string
}

/**
 * Probe the OpenWA gateway: validates the stored API key and confirms the
 * configured session exists and is reachable. Used by the Settings UI so an
 * admin gets a concrete message instead of a silent success toast.
 */
export async function checkWhatsAppConnection(): Promise<WhatsAppConnectionStatus> {
  const config = await getConfig()
  if (!config) {
    return { ok: false, reachedGateway: false, error: 'WhatsApp not configured. Fill in base URL, session ID, and API key.' }
  }

  try {
    // Validate key against the gateway (also confirms the base URL is right).
    const authRes = await fetch(`${config.base_url}/api/auth/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': config.api_key },
      signal: AbortSignal.timeout(10000),
    })
    const authJson = await authRes.json().catch(() => ({}))
    if (!authRes.ok || !authJson.valid) {
      return {
        ok: false,
        reachedGateway: true,
        error: `Gateway rejected the apiKey (HTTP ${authRes.status}). Check the key in your OpenWA dashboard.`,
      }
    }

    // Confirm the configured session exists on the gateway.
    const sessionRes = await fetch(`${config.base_url}/api/sessions/${config.session_id}`, {
      headers: { 'X-API-Key': config.api_key },
      signal: AbortSignal.timeout(10000),
    })
    if (!sessionRes.ok) {
      return {
        ok: false,
        reachedGateway: true,
        sessionId: config.session_id,
        error: sessionRes.status === 404
          ? `OpenWA has no session "${config.session_id}". Create/start it in the OpenWA dashboard, then copy its exact ID.`
          : `Session check failed (HTTP ${sessionRes.status}).`,
      }
    }
    const session = await sessionRes.json().catch(() => ({}))
    const status = String(session.status || '')
    return {
      ok: status === 'ready' || status === 'authenticating',
      reachedGateway: true,
      sessionId: config.session_id,
      sessionName: String(session.name || ''),
      sessionStatus: status,
      phone: String(session.phone || ''),
      error: status === 'ready' ? undefined : `Session "${config.session_id}" is ${status} — scan the QR code in the OpenWA dashboard to link WhatsApp.`,
    }
  } catch (e) {
    return { ok: false, reachedGateway: false, error: `Could not reach OpenWA gateway at ${config.base_url}: ${(e as Error).message}` }
  }
}

/**
 * Invalidate config cache (call after admin updates WhatsApp settings).
 */
export function invalidateWhatsAppConfig(): void {
  _configCache = null
  _configCacheTime = 0
}
