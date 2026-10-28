/**
 * WhatsApp transport for screening: Meta WhatsApp Cloud API (messages +
 * Business Calling) and a 'simulated' twin with the same interface, used when
 * Meta isn't configured and in tests.
 *
 * Graph endpoints (version from settings, default v23.0):
 *   POST /{phone_number_id}/messages   template | text | interactive (button, list, call_permission_request)
 *   POST /{phone_number_id}/calls      business-initiated call (Graph/WebRTC mode only — SIP numbers can't use it)
 *   POST /{phone_number_id}/settings   enable calling + SIP server
 *   GET  /{media_id} → url → GET url   voice-note download
 */
import type { PlatformScreeningConfig } from '../config'

export interface SendResult { ok: boolean; id?: string | null; error?: string }

export interface WhatsAppTransport {
  provider: 'meta_whatsapp' | 'simulated'
  phoneNumberId: string | null
  sendTemplate(to: string, t: { name: string; language: string; bodyParams: string[]; quickReplyPayloads?: string[] }, preview: string): Promise<SendResult>
  sendText(to: string, text: string): Promise<SendResult>
  sendButtons(to: string, text: string, buttons: { id: string; title: string }[]): Promise<SendResult>
  sendList(to: string, text: string, buttonLabel: string, rows: { id: string; title: string; description?: string }[]): Promise<SendResult>
  sendCallPermissionRequest(to: string, text: string): Promise<SendResult>
  /** Graph mode only: start a business-initiated call with the voice agent's SDP offer. */
  initiateCall(to: string, sdpOffer: string, callbackData: string): Promise<SendResult>
  downloadMedia(mediaId: string): Promise<{ ok: true; data: ArrayBuffer; mime: string } | { ok: false; error: string }>
}

const digits = (e164: string) => e164.replace(/[^0-9]/g, '')
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

export function metaTransport(cfg: PlatformScreeningConfig, phoneNumberId: string): WhatsAppTransport {
  const base = `https://graph.facebook.com/${cfg.whatsapp.graph_version}`
  const token = cfg.whatsapp.access_token || ''

  async function graph(path: string, body: unknown): Promise<SendResult & { json?: Record<string, unknown> }> {
    try {
      const res = await fetch(`${base}/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      })
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        const err = (json.error as { message?: string; code?: number } | undefined)
        return { ok: false, error: `Meta ${res.status}${err?.code ? ` (${err.code})` : ''}: ${err?.message || 'request failed'}` }
      }
      const msgs = json.messages as { id?: string }[] | undefined
      const calls = json.calls as { id?: string }[] | undefined
      return { ok: true, id: msgs?.[0]?.id || calls?.[0]?.id || null, json }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  const message = (to: string, payload: Record<string, unknown>) =>
    graph(`${phoneNumberId}/messages`, { messaging_product: 'whatsapp', recipient_type: 'individual', to: digits(to), ...payload })

  return {
    provider: 'meta_whatsapp',
    phoneNumberId,
    sendTemplate: (to, t) =>
      message(to, {
        type: 'template',
        template: {
          name: t.name,
          language: { code: t.language },
          components: [
            { type: 'body', parameters: t.bodyParams.map((text) => ({ type: 'text', text: clip(text, 60) })) },
            ...(t.quickReplyPayloads || []).map((payload, i) => ({
              type: 'button', sub_type: 'quick_reply', index: String(i), parameters: [{ type: 'payload', payload }],
            })),
          ],
        },
      }),
    sendText: (to, text) => message(to, { type: 'text', text: { preview_url: false, body: clip(text, 4096) } }),
    sendButtons: (to, text, buttons) =>
      message(to, {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: clip(text, 1024) },
          action: { buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: clip(b.title, 20) } })) },
        },
      }),
    sendList: (to, text, buttonLabel, rows) =>
      message(to, {
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: clip(text, 1024) },
          action: {
            button: clip(buttonLabel, 20),
            sections: [{ title: 'Options', rows: rows.slice(0, 10).map((r) => ({ id: r.id, title: clip(r.title, 24), ...(r.description ? { description: clip(r.description, 72) } : {}) })) }],
          },
        },
      }),
    sendCallPermissionRequest: (to, text) =>
      message(to, {
        type: 'interactive',
        interactive: { type: 'call_permission_request', action: { name: 'call_permission_request' }, body: { text: clip(text, 1024) } },
      }),
    initiateCall: (to, sdp, callbackData) =>
      graph(`${phoneNumberId}/calls`, {
        messaging_product: 'whatsapp',
        to: digits(to),
        action: 'connect',
        session: { sdp_type: 'offer', sdp },
        biz_opaque_callback_data: callbackData.slice(0, 512),
      }),
    async downloadMedia(mediaId) {
      try {
        const meta = await fetch(`${base}/${encodeURIComponent(mediaId)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) })
        const info = (await meta.json().catch(() => ({}))) as { url?: string; mime_type?: string; file_size?: number }
        if (!meta.ok || !info.url) return { ok: false, error: `media lookup ${meta.status}` }
        if ((info.file_size || 0) > 16 * 1024 * 1024) return { ok: false, error: 'voice note too large' }
        // only follow Meta's own CDN
        const host = new URL(info.url).hostname
        if (!/(^|\.)(fbsbx\.com|whatsapp\.net|facebook\.com|fbcdn\.net)$/.test(host)) return { ok: false, error: 'unexpected media host' }
        const file = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) })
        if (!file.ok) return { ok: false, error: `media download ${file.status}` }
        return { ok: true, data: await file.arrayBuffer(), mime: info.mime_type || 'audio/ogg' }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },
  }
}

/** Enable WhatsApp calling with SIP pointing at the voice agent (settings → "Apply to number"). */
export async function applySipSettings(cfg: PlatformScreeningConfig, phoneNumberId: string, sipUri: string): Promise<SendResult> {
  const parsed = parseSipUri(sipUri)
  if (!parsed) return { ok: false, error: 'Voice agent SIP URI must look like sip:agent.example.com:5061' }
  try {
    const res = await fetch(`https://graph.facebook.com/${cfg.whatsapp.graph_version}/${phoneNumberId}/settings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.whatsapp.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        calling: {
          status: 'ENABLED',
          sip: { status: 'ENABLED', webhook_delivery: 'ENABLED', servers: [{ hostname: parsed.host, port: parsed.port }] },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    })
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    return res.ok ? { ok: true } : { ok: false, error: json.error?.message || `Meta ${res.status}` }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export function parseSipUri(uri: string): { host: string; port: number; user: string | null } | null {
  const m = String(uri || '').trim().match(/^sips?:(?:([^@\s]+)@)?([A-Za-z0-9.-]+\.[A-Za-z]{2,})(?::(\d{2,5}))?(?:;.*)?$/)
  if (!m) return null
  return { user: m[1] || null, host: m[2].toLowerCase(), port: m[3] ? Number(m[3]) : 5061 }
}

/** The request URI a SIP voice agent dials for a business-initiated WhatsApp call. */
export const whatsappSipTarget = (e164: string) => `sip:+${digits(e164)}@wa.meta.vc;transport=tls`

// ─── Simulated ──────────────────────────────────────────────────────────────

export interface SimulatedMessage { to: string; kind: string; text: string; ids?: string[]; at: string }
/** In-memory outbox (bounded) — tests assert on it; unconfigured deployments show messages in the transcript. */
export const simulatedOutbox: SimulatedMessage[] = []
let simSeq = 0

export function simulatedTransport(): WhatsAppTransport {
  const push = (to: string, kind: string, text: string, ids?: string[]): SendResult => {
    simulatedOutbox.push({ to, kind, text, ids, at: new Date().toISOString() })
    if (simulatedOutbox.length > 200) simulatedOutbox.shift()
    return { ok: true, id: `sim_wamid_${++simSeq}` }
  }
  return {
    provider: 'simulated',
    phoneNumberId: null,
    sendTemplate: async (to, t, preview) => push(to, `template:${t.name}`, preview, t.quickReplyPayloads),
    sendText: async (to, text) => push(to, 'text', text),
    sendButtons: async (to, text, b) => push(to, 'buttons', text, b.map((x) => x.id)),
    sendList: async (to, text, _l, rows) => push(to, 'list', text, rows.map((x) => x.id)),
    sendCallPermissionRequest: async (to, text) => push(to, 'call_permission_request', text),
    initiateCall: async (to) => ({ ...push(to, 'call', 'WhatsApp call'), id: `sim_wacid_${++simSeq}` }),
    downloadMedia: async () => ({ ok: false, error: 'simulated' }),
  }
}
