/**
 * Out-of-app notification delivery (email / push / WhatsApp) with quiet hours.
 *
 * Quiet hours are stored per user in `notification_preferences`
 * ({ user_id, type: 'quiet_hours', quietStart, quietEnd, enabled?, timeZone? }).
 * They apply only once a user has saved them (and not set enabled: false).
 *
 * During a user's quiet window, non-urgent deliveries are **deferred**: the
 * fully rendered payloads go into `notification_deferred` with
 * `deliver_after` = end of the window, and `flushDeferredDeliveries()` (run
 * from /api/cron/tick every minute) sends them once the window has ended.
 * Urgent deliveries (security events, or `urgent: true`) always go out now.
 * The in-app notification itself is never delayed.
 */
import type { Db, Document, Filter } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ids'
import type { PushPayload } from '@/lib/push-notifications'
import { outboundT } from '@/lib/i18n/outbound'
import { toLocale } from '@/lib/i18n/config'

/** Email digest defaults when a user has never saved a `digest` preference. */
export const DIGEST_DEFAULTS = { daily: false, weekly: true } as const

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export interface QuietHours {
  enabled: boolean
  quietStart: string
  quietEnd: string
  timeZone: string
}

export interface DeliveryPayload {
  email?: {
    to: string
    subject: string
    html: string
    /**
     * Mail category (lib/automation/mailer MailCategory). Unsubscribes for it
     * (or for "all automated email") are honoured and the footer + one-click
     * List-Unsubscribe headers are added (AUTO-052). Default 'transactional'.
     */
    category?: string
    headers?: Record<string, string>
    fromName?: string
    /** Recipient language for the footer (lib/i18n); English when absent (older deferred rows). */
    locale?: string
    /** Already rendered by the automation mailer (footer, headers and unsubscribe checks done). */
    managed?: boolean
  }
  push?: PushPayload
  /**
   * WhatsApp for one user (AUTO-060): sent only through lib/whatsapp-send
   * (consent, opt-outs, approved Meta template; the unofficial gateway only
   * when a superadmin enabled it). `phone` on older deferred rows is ignored.
   */
  whatsapp?: { text: string; title?: string; link?: string; phone?: string; locale?: string }
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** The user's saved quiet hours, or null when none are saved / they're off. */
export async function getQuietHours(userId: string, db?: Db): Promise<QuietHours | null> {
  try {
    const d = db ?? (await getMongoDb())
    const doc = await d.collection('notification_preferences').findOne({ user_id: userId, type: 'quiet_hours' })
    if (!doc || doc.enabled === false) return null
    if (typeof doc.quietStart !== 'string' || typeof doc.quietEnd !== 'string') return null
    if (!HHMM.test(doc.quietStart) || !HHMM.test(doc.quietEnd) || doc.quietStart === doc.quietEnd) return null
    return {
      enabled: true,
      quietStart: doc.quietStart,
      quietEnd: doc.quietEnd,
      timeZone: isValidTimeZone(doc.timeZone) ? doc.timeZone : 'UTC',
    }
  } catch (e) {
    console.error('[notifications] quiet hours lookup failed:', e)
    return null
  }
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * If `now` falls inside the quiet window, returns when the window ends;
 * otherwise null. Windows may wrap midnight (22:00 → 08:00).
 */
export function quietWindowEnd(qh: QuietHours, now: Date = new Date()): Date | null {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: qh.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  const cur = h * 60 + m
  const start = toMinutes(qh.quietStart)
  const end = toMinutes(qh.quietEnd)
  const inside = start < end ? cur >= start && cur < end : cur >= start || cur < end
  if (!inside) return null
  const minutesLeft = (end - cur + 1440) % 1440
  // ponytail: minute precision, ignores a DST jump inside the window (off by ≤1h at worst).
  const endsAt = new Date(now.getTime() + minutesLeft * 60_000)
  endsAt.setUTCSeconds(0, 0)
  return endsAt
}

/** Send every channel present in the payload right now (each best-effort). */
export async function deliverNow(userId: string, payload: DeliveryPayload): Promise<void> {
  if (payload.push) {
    try {
      const { sendPushToUser } = await import('@/lib/push-notifications')
      await sendPushToUser(userId, payload.push)
    } catch (e) { console.error('[notifications] push failed:', e) }
  }
  if (payload.email) {
    try {
      const e = payload.email
      let html = e.html
      let headers = e.headers
      if (!e.managed) {
        // AUTO-052: notification and digest emails honour "unsubscribe" too, and carry the link.
        const { isUnsubscribed, listUnsubscribeHeaders, unsubscribeUrl } = await import('@/lib/automation/mailer')
        const category = (e.category || 'transactional') as import('@/lib/automation/mailer').MailCategory
        if (await isUnsubscribed(e.to, category)) html = ''
        else {
          headers = headers ?? listUnsubscribeHeaders(e.to, category)
          html = appendUnsubscribeFooter(html, unsubscribeUrl(e.to, category === 'billing' || category === 'security' ? 'engagement' : category), e.locale)
        }
      }
      if (html) {
        const { sendEmail } = await import('@/lib/send-email')
        await sendEmail(e.to, { subject: e.subject, html }, undefined, { headers, fromName: e.fromName })
      }
    } catch (e) { console.error('[notifications] email failed:', e) }
  }
  await deliverWhatsApp(userId, payload)
}

async function deliverWhatsApp(userId: string, payload: DeliveryPayload): Promise<void> {
  if (!payload.whatsapp) return
  try {
    const { sendWhatsAppToUser } = await import('@/lib/whatsapp-send')
    const { toLocale } = await import('@/lib/i18n/config')
    await sendWhatsAppToUser(userId, { kind: 'notification', title: payload.whatsapp.title || '', text: payload.whatsapp.text, link: payload.whatsapp.link || '', urgent: true, locale: toLocale(payload.whatsapp.locale) ?? undefined })
  } catch (e) { console.error('[notifications] whatsapp failed:', e) }
}

/** Pure: add a small unsubscribe / preferences footer before </body> (or at the end). */
export function appendUnsubscribeFooter(html: string, unsubscribeLink: string | null, locale?: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const manage = `${base}/dashboard/notifications/preferences`
  const t = outboundT('notify', toLocale(locale) ?? 'en')
  const footer = `<p style="color:#9ca3af;font-size:12px;margin:24px 0 0;font-family:sans-serif"><a href="${escapeHtml(manage)}" style="color:#6b7280">${escapeHtml(t('email.preferences'))}</a>${unsubscribeLink ? ` · <a href="${escapeHtml(unsubscribeLink)}" style="color:#6b7280">${escapeHtml(t('email.unsubscribe'))}</a>` : ''}</p>`
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${footer}</body>`) : html + footer
}

/**
 * Deliver now, or defer to the end of the user's quiet window.
 * Returns 'deferred' when queued, 'sent' otherwise.
 */
export async function deliverOrDefer(
  userId: string,
  payload: DeliveryPayload,
  opts: { urgent?: boolean; notificationId?: string } = {},
): Promise<'sent' | 'deferred'> {
  if (!payload.email && !payload.push && !payload.whatsapp) return 'sent'
  if (!opts.urgent) {
    const db = await getMongoDb()
    const qh = await getQuietHours(userId, db)
    const until = qh ? quietWindowEnd(qh) : null
    if (until) {
      try {
        await db.collection('notification_deferred').insertOne({
          id: newId(),
          user_id: userId,
          notification_id: opts.notificationId ?? null,
          payload,
          deliver_after: until.toISOString(),
          status: 'pending',
          attempts: 0,
          created_at: nowIso(),
        })
        startDeferredFlushLoop()
        return 'deferred'
      } catch (e) {
        // If we can't queue it, skip rather than wake the user up.
        console.error('[notifications] defer failed, dropping out-of-app delivery:', e)
        return 'deferred'
      }
    }
  }
  await deliverNow(userId, payload)
  return 'sent'
}

/**
 * Send deferred deliveries whose quiet window has ended. Each row is claimed
 * atomically (pending → sending) so overlapping ticks never double-send.
 */
export async function flushDeferredDeliveries(now: Date = new Date(), limit = 200): Promise<number> {
  const db = await getMongoDb()
  const col = db.collection('notification_deferred')
  const nowStr = now.toISOString()
  let sent = 0
  for (let i = 0; i < limit; i++) {
    const claimed = await col.findOneAndUpdate(
      { status: 'pending', deliver_after: { $lte: nowStr } } as Filter<Document>,
      { $set: { status: 'sending', claimed_at: nowStr }, $inc: { attempts: 1 } },
      { sort: { deliver_after: 1 }, returnDocument: 'after' },
    )
    if (!claimed) break
    try {
      await deliverNow(String(claimed.user_id), (claimed.payload || {}) as DeliveryPayload)
      await col.updateOne({ id: claimed.id }, { $set: { status: 'sent', sent_at: nowIso() } })
      sent++
    } catch (e) {
      console.error('[notifications] deferred delivery failed:', e)
      await col.updateOne({ id: claimed.id }, { $set: { status: 'failed' } })
    }
  }
  return sent
}

/**
 * In-process safety net: once this process has deferred something, flush due
 * rows every minute even if no external cron hits /api/cron/tick. Claims are
 * atomic, so running alongside the tick (or on several instances) is safe.
 */
export function startDeferredFlushLoop(): void {
  const g = globalThis as unknown as { __csDeferredFlush?: ReturnType<typeof setInterval> }
  if (g.__csDeferredFlush || typeof window !== 'undefined') return
  g.__csDeferredFlush = setInterval(() => {
    flushDeferredDeliveries().catch((e) => console.error('[notifications] deferred flush loop failed:', e))
  }, 60_000)
  const t = g.__csDeferredFlush as unknown as { unref?: () => void }
  t.unref?.()
}

export interface DigestRecipient { id: string; email: string; name: string }

/**
 * Users who should get the given digest: weekly is opt-out (default on),
 * daily is opt-in (default off). Users who switched the email channel off,
 * or set `newsletter_subscribed: false`, are excluded from both.
 */
export async function getDigestRecipients(kind: 'daily' | 'weekly', db?: Db): Promise<DigestRecipient[]> {
  const d = db ?? (await getMongoDb())
  const prefs = d.collection('notification_preferences')
  const emailOff = new Set(
    (await prefs.find({ type: 'email', enabled: false }, { projection: { user_id: 1 } }).toArray()).map((p) => String(p.user_id)),
  )
  const userFilter: Record<string, unknown> = { email: { $exists: true, $ne: '' }, newsletter_subscribed: { $ne: false } }
  let optedOut = new Set<string>()
  if (kind === 'daily') {
    const optedIn = (await prefs.find({ type: 'digest', daily: true }, { projection: { user_id: 1 } }).toArray())
      .map((p) => String(p.user_id))
      .filter((id) => !emailOff.has(id))
    if (optedIn.length === 0) return []
    userFilter.$or = [{ id: { $in: optedIn } }, { _id: { $in: optedIn } }]
  } else {
    optedOut = new Set(
      (await prefs.find({ type: 'digest', weekly: false }, { projection: { user_id: 1 } }).toArray()).map((p) => String(p.user_id)),
    )
  }
  const docs = await d.collection('user')
    .find(userFilter as Filter<Document>, { projection: { id: 1, _id: 1, email: 1, fullName: 1, name: 1 } })
    .toArray()
  const out: DigestRecipient[] = []
  for (const u of docs) {
    const id = String(u.id ?? u._id)
    if (emailOff.has(id) || optedOut.has(id)) continue
    out.push({ id, email: String(u.email), name: String(u.fullName || u.name || 'there') })
  }
  return out
}

export function escapeHtml(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Claim one digest send for (kind, user, period). Returns false when that
 * user already got this period's digest, so a cron that fires twice can't
 * double-send. ponytail: upsert without a unique index — a simultaneous
 * double fire could still race; add a unique index on `key` if that matters.
 */
export async function claimDigestSend(db: Db, kind: 'daily' | 'weekly', userId: string, period: string): Promise<boolean> {
  const key = `${kind}:${userId}:${period}`
  const r = await db.collection('digest_sends').updateOne(
    { key },
    { $setOnInsert: { key, kind, user_id: userId, period, created_at: nowIso() } },
    { upsert: true },
  )
  return r.upsertedCount > 0
}
