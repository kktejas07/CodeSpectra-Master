/**
 * Email outbox (AU-06 / A-036) + bounce suppression (A-038).
 *
 * - sendEmail (lib/send-email.ts) asks `isSuppressed` before every send and
 *   hands transient failures to `enqueueFailedEmail`.
 * - `processOutbox` (scheduler, every minute) retries with exponential
 *   backoff; after the last attempt the message goes to the dead-letter list
 *   and admins are alerted.
 * - Postal bounce/complaint webhooks call `recordDeliveryProblem`; hard
 *   bounces and complaints add the address to `email_suppressions`.
 */
import { col, deadLetter, newId, nowIso } from './store'
import { backoffDelayMs, OUTBOX_BACKOFF } from './backoff'

export const OUTBOX_MAX_ATTEMPTS = 6

// ─── Pure helpers ───────────────────────────────────────────────────────────

export function normalizeEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const e = v.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : null
}

/**
 * Is a send error worth retrying? Config problems and 4xx answers (bad
 * address, rejected content) are not; network errors, 429 and 5xx are.
 */
export function isRetryableSendError(error: string | null | undefined): boolean {
  if (!error) return false
  if (/not configured/i.test(error)) return false
  const m = /Postal API error \((\d{3})\)/.exec(error)
  if (m) {
    const code = Number(m[1])
    return code === 429 || code >= 500
  }
  return true
}

/** Classify a delivery webhook: hard bounces and complaints suppress the address. */
export function classifyDeliveryProblem(status: string, detail?: string | null): 'hard' | 'complaint' | 'soft' | null {
  const s = (status || '').toLowerCase()
  const d = (detail || '').toLowerCase()
  if (s === 'spam' || /complain|abuse report|spam report/.test(d)) return 'complaint'
  if (s === 'bounced') {
    if (/\b4\.\d\.\d\b|mailbox full|quota|temporar|try again/.test(d)) return 'soft'
    return 'hard'
  }
  if (s === 'failed') {
    if (/\b5\.\d\.\d\b|\b55\d\b|user unknown|no such user|does not exist|invalid recipient|recipient address rejected/.test(d)) return 'hard'
    return 'soft'
  }
  return null
}

// ─── Suppression ────────────────────────────────────────────────────────────

const cache = new Map<string, { v: boolean; at: number }>()
const CACHE_MS = 60_000

export async function isSuppressed(email: string): Promise<boolean> {
  const e = normalizeEmail(email)
  if (!e) return false
  const hit = cache.get(e)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.v
  try {
    const doc = await (await col('email_suppressions')).findOne({ email: e, active: { $ne: false } }, { projection: { _id: 1 } })
    const v = !!doc
    if (cache.size > 5000) cache.clear()
    cache.set(e, { v, at: Date.now() })
    return v
  } catch {
    return false // never block mail because the lookup failed
  }
}

export async function suppressAddress(email: string, reason: 'hard_bounce' | 'complaint' | 'manual', detail?: string | null): Promise<boolean> {
  const e = normalizeEmail(email)
  if (!e) return false
  const ts = nowIso()
  await (await col('email_suppressions')).updateOne(
    { email: e },
    { $set: { email: e, reason, detail: (detail || '').slice(0, 300), active: true, updated_at: ts }, $setOnInsert: { id: newId(), created_at: ts }, $inc: { events: 1 } },
    { upsert: true },
  )
  cache.set(e, { v: true, at: Date.now() })
  return true
}

export async function unsuppressAddress(email: string): Promise<void> {
  const e = normalizeEmail(email)
  if (!e) return
  await (await col('email_suppressions')).updateOne({ email: e }, { $set: { active: false, updated_at: nowIso() } })
  cache.delete(e)
}

/** Called by the Postal webhook for bounced / failed / spam events. */
export async function recordDeliveryProblem(postalMessageId: number, status: string, detail?: string | null): Promise<'suppressed' | 'ignored'> {
  const kind = classifyDeliveryProblem(status, detail)
  if (kind !== 'hard' && kind !== 'complaint') return 'ignored'
  const { getMongoDb } = await import('@/lib/mongodb')
  const db = await getMongoDb()
  const log = await db.collection('email_logs').findOne({ postal_message_id: Number(postalMessageId) }, { projection: { to_email: 1 } })
  const invite = log ? null : await db.collection('candidate_invites').findOne({ postal_message_id: Number(postalMessageId) }, { projection: { email: 1 } })
  const to = String(log?.to_email || invite?.email || '')
  if (!to) return 'ignored'
  await suppressAddress(to, kind === 'complaint' ? 'complaint' : 'hard_bounce', detail)
  return 'suppressed'
}

// ─── Outbox ─────────────────────────────────────────────────────────────────

export interface OutboxMessage {
  to: string
  subject: string
  html: string
  cc?: string
  category?: string
  campaignId?: string
  attachments?: { name: string; content_type: string; data: string }[]
  /** Kept so a retried email still carries List-Unsubscribe etc. */
  headers?: Record<string, string>
  fromName?: string
}

const MAX_ATTACHMENT_CHARS = 8_000_000

/** Queue a failed send for retry. Returns false when the error isn't retryable. */
export async function enqueueFailedEmail(msg: OutboxMessage, error: string, now = new Date()): Promise<boolean> {
  if (!isRetryableSendError(error)) return false
  const attachSize = (msg.attachments || []).reduce((n, a) => n + (a.data?.length || 0), 0)
  try {
    await (await col('email_outbox')).insertOne({
      id: newId(),
      to: msg.to,
      cc: msg.cc || null,
      subject: msg.subject.slice(0, 500),
      html: msg.html,
      category: msg.category || 'transactional',
      campaign_id: msg.campaignId || null,
      headers: msg.headers || null,
      from_name: msg.fromName || null,
      // Huge attachments are not kept; the retry sends without them and says so in the log.
      attachments: attachSize <= MAX_ATTACHMENT_CHARS ? msg.attachments || [] : [],
      attachments_dropped: attachSize > MAX_ATTACHMENT_CHARS,
      status: 'pending',
      attempts: 1,
      last_error: error.slice(0, 500),
      next_attempt_at: new Date(now.getTime() + backoffDelayMs(1, OUTBOX_BACKOFF)).toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    return true
  } catch (e) {
    console.error('[outbox] enqueue failed:', e)
    return false
  }
}

/** Retry due outbox messages. Each row is claimed atomically. */
export async function processOutbox(now = new Date(), limit = 50, budgetMs = 20_000): Promise<{ sent: number; failed: number; dead: number }> {
  const c = await col('email_outbox')
  const out = { sent: 0, failed: 0, dead: 0 }
  const started = Date.now()
  const { sendEmail } = await import('@/lib/send-email')
  for (let i = 0; i < limit && Date.now() - started < budgetMs; i++) {
    const nowStr = now.toISOString()
    const row = await c.findOneAndUpdate(
      { status: 'pending', next_attempt_at: { $lte: nowStr } },
      { $set: { status: 'sending', claimed_at: nowStr } },
      { sort: { next_attempt_at: 1 }, returnDocument: 'after' },
    )
    if (!row) break
    const r = await sendEmail(String(row.to), { subject: String(row.subject), html: String(row.html) }, row.cc ? String(row.cc) : undefined, {
      category: String(row.category || 'transactional'),
      campaignId: row.campaign_id ? String(row.campaign_id) : undefined,
      attachments: Array.isArray(row.attachments) && row.attachments.length ? row.attachments : undefined,
      headers: row.headers && typeof row.headers === 'object' ? (row.headers as Record<string, string>) : undefined,
      fromName: typeof row.from_name === 'string' ? row.from_name : undefined,
      outboxId: String(row.id),
    })
    const attempts = Number(row.attempts || 1) + 1
    if (r.success) {
      await c.updateOne({ id: row.id }, { $set: { status: 'sent', attempts, sent_at: nowIso(), updated_at: nowIso() } })
      out.sent++
      continue
    }
    if ((r as { suppressed?: boolean }).suppressed) {
      await c.updateOne({ id: row.id }, { $set: { status: 'suppressed', attempts, updated_at: nowIso() } })
      continue
    }
    const error = String(r.error || 'send failed')
    if (attempts >= OUTBOX_MAX_ATTEMPTS || !isRetryableSendError(error)) {
      await c.updateOne({ id: row.id }, { $set: { status: 'dead', attempts, last_error: error.slice(0, 500), updated_at: nowIso() } })
      await deadLetter({ kind: 'email', ref: String(row.id), error, detail: { subject: row.subject, attempts } })
      out.dead++
      continue
    }
    await c.updateOne(
      { id: row.id },
      { $set: { status: 'pending', attempts, last_error: error.slice(0, 500), next_attempt_at: new Date(now.getTime() + backoffDelayMs(attempts, OUTBOX_BACKOFF)).toISOString(), updated_at: nowIso() } },
    )
    out.failed++
  }
  // Rows stuck in 'sending' (process died mid-send) go back to pending after 15 minutes.
  await c.updateMany(
    { status: 'sending', claimed_at: { $lt: new Date(now.getTime() - 15 * 60_000).toISOString() } },
    { $set: { status: 'pending' } },
  ).catch(() => {})
  return out
}
