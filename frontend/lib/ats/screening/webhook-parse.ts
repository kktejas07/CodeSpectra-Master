/**
 * Meta WhatsApp webhook body → screening inputs (pure). Field `messages`
 * carries replies, voice notes and call-permission replies; field `calls`
 * carries business-initiated call lifecycle (connect / terminate) and
 * `statuses[type=call]` RINGING / ACCEPTED / REJECTED.
 */
import type { CallStatusEvent, InboundMessage } from './machine'

type Any = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export function parseMetaWebhook(body: unknown): { messages: InboundMessage[]; calls: CallStatusEvent[] } {
  const messages: InboundMessage[] = []
  const calls: CallStatusEvent[] = []
  const entries: Any[] = Array.isArray((body as Any)?.entry) ? (body as Any).entry : []
  for (const entry of entries) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const v: Any = change?.value || {}
      const phoneNumberId = typeof v.metadata?.phone_number_id === 'string' ? v.metadata.phone_number_id : null
      for (const m of Array.isArray(v.messages) ? v.messages : []) {
        if (typeof m?.id !== 'string' || typeof m?.from !== 'string') continue
        const at = /^\d+$/.test(String(m.timestamp || '')) ? new Date(Number(m.timestamp) * 1000).toISOString() : undefined
        const base: InboundMessage = { id: m.id, from: m.from, type: String(m.type || 'unknown'), phoneNumberId, at }
        switch (m.type) {
          case 'text':
            messages.push({ ...base, text: String(m.text?.body || '').slice(0, 4000) })
            break
          case 'button': // template quick reply
            messages.push({ ...base, replyId: String(m.button?.payload || ''), replyTitle: String(m.button?.text || '') })
            break
          case 'interactive': {
            const i: Any = m.interactive || {}
            if (i.type === 'button_reply') messages.push({ ...base, replyId: String(i.button_reply?.id || ''), replyTitle: String(i.button_reply?.title || '') })
            else if (i.type === 'list_reply') messages.push({ ...base, replyId: String(i.list_reply?.id || ''), replyTitle: String(i.list_reply?.title || '') })
            else if (i.type === 'call_permission_reply') {
              const r: Any = i.call_permission_reply || {}
              messages.push({
                ...base,
                permission: {
                  response: r.response === 'accept' ? 'accept' : 'reject',
                  expiration_timestamp: typeof r.expiration_timestamp === 'number' ? r.expiration_timestamp : Number(r.expiration_timestamp) || null,
                },
              })
            }
            break
          }
          case 'audio':
            messages.push({ ...base, mediaId: String(m.audio?.id || ''), mime: String(m.audio?.mime_type || 'audio/ogg') })
            break
          default:
            messages.push(base) // stickers, images…: logged in the transcript, not answers
        }
      }
      for (const c of Array.isArray(v.calls) ? v.calls : []) {
        if (typeof c?.id !== 'string') continue
        if (c.event === 'connect') {
          calls.push({ ref: c.id, event: 'connected', sdpAnswer: typeof c.session?.sdp === 'string' ? c.session.sdp : null, eventId: `call:${c.id}:connect` })
        } else if (c.event === 'terminate') {
          const dur = Number(c.duration)
          const failed = String(c.status || '').toUpperCase() === 'FAILED'
          calls.push({ ref: c.id, event: failed && !(dur > 0) ? 'no_answer' : 'terminated', durationSec: Number.isFinite(dur) ? dur : null, eventId: `call:${c.id}:terminate` })
        }
      }
      for (const s of Array.isArray(v.statuses) ? v.statuses : []) {
        if (s?.type !== 'call' || typeof s.id !== 'string') continue
        const st = String(s.status || '').toUpperCase()
        const event = st === 'RINGING' ? 'ringing' : st === 'ACCEPTED' ? 'connected' : st === 'REJECTED' ? 'rejected' : null
        if (event) calls.push({ ref: s.id, event, eventId: `call:${s.id}:status:${st}` })
      }
    }
  }
  return { messages, calls }
}
