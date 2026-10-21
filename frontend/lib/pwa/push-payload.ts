/**
 * Web push payload builder (pure; tests/pwa-push.test.ts).
 *
 * Push services cap the encrypted payload at ~4 KB, and anything in it is
 * shown on a lock screen, so we send only a short title/body, a same-origin
 * link and a few string ids — never personal fields from metadata.
 * The service worker reads it in public/pwa-core.js notificationFromPush().
 */
import type { PushPayload } from '@/lib/push-notifications'

export const MAX_PUSH_BYTES = 3072
const TITLE_MAX = 80
const BODY_MAX = 240
/** Only these data keys travel to the device (ids/types, never PII). */
const DATA_KEYS = ['type', 'category', 'notification_id'] as const

export interface WebPushMessage {
  v: 1
  title: string
  body: string
  url: string
  tag?: string
  data: Record<string, string>
}

function clip(s: unknown, max: number): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

/** Same-origin relative path or /dashboard (no open redirects from a notification tap). */
export function safePushLink(link: unknown): string {
  const s = typeof link === 'string' ? link.trim() : ''
  if (!s.startsWith('/') || s.startsWith('//') || s.startsWith('/\\')) return '/dashboard'
  return s.slice(0, 512)
}

export function buildWebPushMessage(payload: PushPayload, opts: { notificationId?: string } = {}): WebPushMessage {
  const data: Record<string, string> = {}
  for (const k of DATA_KEYS) {
    const v = payload.data?.[k]
    if (typeof v === 'string' && v) data[k] = v.slice(0, 64)
  }
  const id = opts.notificationId || data.notification_id
  if (id) data.notification_id = id.slice(0, 64)
  const msg: WebPushMessage = {
    v: 1,
    title: clip(payload.title, TITLE_MAX) || 'CodeSpectra',
    body: clip(payload.body, BODY_MAX),
    url: safePushLink(payload.link),
    data,
  }
  // Same tag = the OS replaces instead of stacking (e.g. a deferred resend).
  if (id) msg.tag = id.slice(0, 64)
  return msg
}

/** JSON string under MAX_PUSH_BYTES (body trimmed first, then title). */
export function serializeWebPush(msg: WebPushMessage): string {
  let out = JSON.stringify(msg)
  const bytes = (s: string) => new TextEncoder().encode(s).length
  if (bytes(out) <= MAX_PUSH_BYTES) return out
  const m = { ...msg, data: {} }
  out = JSON.stringify(m)
  while (bytes(out) > MAX_PUSH_BYTES && m.body.length > 0) {
    m.body = clip(m.body.slice(0, Math.floor(m.body.length / 2)), BODY_MAX)
    out = JSON.stringify(m)
  }
  if (bytes(out) > MAX_PUSH_BYTES) out = JSON.stringify({ v: 1, title: clip(m.title, 40), body: '', url: m.url, data: {} })
  return out
}

/** Push channel decision: the channel switch and the per-type switch must both allow it. */
export function pushAllowed(channelPref: { enabled?: unknown } | null | undefined, typePref: { enabled?: unknown; push?: unknown } | null | undefined): boolean {
  if (channelPref?.enabled === false) return false
  if (typePref?.enabled === false || typePref?.push === false) return false
  return true
}

/** Push service responses that mean "this subscription is gone — delete it". */
export function isGoneStatus(status: number | undefined): boolean {
  return status === 404 || status === 410
}
