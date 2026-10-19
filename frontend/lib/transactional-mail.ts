import { getServerSecretsFromCache, warmServerSecretsCache } from '@/lib/server-secrets-cache'

/** A hung mail server must never stall the scheduler (AUTO-043); the outbox retries timeouts. */
export const POSTAL_TIMEOUT_MS = 15_000

/** Plain-text alternative of an HTML email (AUTO-050: multipart mail scores better with spam filters). Pure. */
export function htmlToText(html: string): string {
  return String(html || '')
    .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, '').trim()
      return text && text !== href ? `${text} (${href})` : href
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|table)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 100_000)
}

/** Only well-formed header names/values are passed on (no CR/LF injection). Pure. */
export function safeMailHeaders(h: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!h) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(h)) {
    if (!/^[A-Za-z][A-Za-z0-9-]{1,60}$/.test(k) || typeof v !== 'string' || /[\r\n]/.test(v) || v.length > 2000) continue
    out[k] = v
  }
  return Object.keys(out).length ? out : undefined
}

export async function sendEmailViaPostal(params: {
  to: string
  subject: string
  html: string
  text?: string
  cc?: string
  /** Optional attachments (Postal: name, content_type, base64 data). */
  attachments?: { name: string; content_type: string; data: string }[]
  /** Extra headers, e.g. List-Unsubscribe / List-Unsubscribe-Post. */
  headers?: Record<string, string>
  /** Reply-To (defaults to EMAIL_REPLY_TO when set). */
  replyTo?: string
  /** Display name for the From address ("Acme via CodeSpectra"). */
  fromName?: string
}): Promise<{ messageId: number | null }> {
  await warmServerSecretsCache()
  const s = getServerSecretsFromCache()
  const server = (process.env.POSTAL_SERVER?.trim() || s.postal_server?.trim()) ?? ''
  const apiKey = (process.env.POSTAL_API_KEY?.trim() || s.postal_api_key?.trim()) ?? ''
  const from = (process.env.POSTAL_FROM_EMAIL?.trim() || s.postal_from_email?.trim()) ?? ''
  if (!server || !apiKey || !from) {
    throw new Error(
      'Postal is not configured: add Server URL, API key, and From address under Platform settings → Integrations, or set POSTAL_SERVER, POSTAL_API_KEY, POSTAL_FROM_EMAIL in the server environment.'
    )
  }

  const url = `${server.replace(/\/+$/, '')}/api/v1/send/message`
  const replyTo = (params.replyTo || process.env.EMAIL_REPLY_TO || '').trim()
  const fromName = (params.fromName || '').replace(/["<>\r\n]/g, '').trim().slice(0, 80)
  const headers = safeMailHeaders(params.headers)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Server-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: [params.to],
      ...(params.cc ? { cc: [params.cc] } : {}),
      from: fromName && !from.includes('<') ? `"${fromName}" <${from}>` : from,
      subject: params.subject,
      html_body: params.html,
      // Postal's field for the text part is plain_body.
      plain_body: params.text || htmlToText(params.html),
      ...(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(replyTo) ? { reply_to: replyTo } : {}),
      ...(headers ? { headers } : {}),
      ...(params.attachments?.length ? { attachments: params.attachments } : {}),
    }),
    signal: AbortSignal.timeout(POSTAL_TIMEOUT_MS),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Postal API error (${res.status}): ${body || res.statusText}`)
  }

  const data = await res.json()
  // Postal nests the numeric id under data.messages[recipient].id
  // (top-level data.id is absent; data.message_id is a string token).
  const messages = data?.data?.messages
  let messageId: number | null = null
  if (messages && typeof messages === 'object') {
    const first = Object.values(messages)[0] as { id?: number } | undefined
    if (first?.id != null) messageId = Number(first.id)
  }
  if (messageId == null && data?.data?.id != null) messageId = Number(data.data.id)
  if (messageId == null && data?.id != null) messageId = Number(data.id)
  return { messageId: Number.isFinite(messageId as number) ? messageId : null }
}
