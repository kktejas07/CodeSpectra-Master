/**
 * One sender for every Wave 15 nudge (server only).
 *
 *   deliverNudge({ automationId, key, to, email?, inApp?, whatsapp?, stillDue?, priority?, capExempt? })
 *
 * In order:
 *   1. once per `key` (automation_sends ledger) — a sweep that runs twice never sends twice;
 *   2. stop condition: `stillDue()` re-checked right before sending (they acted → nothing);
 *   3. shared frequency cap across ALL nudges (nudge_ledger, per person, rolling
 *      24 h / 7 days, Admin → Automations → Nudge limits). A capped nudge
 *      releases its claim so the next sweep can still send it while its window lasts;
 *   4. email through sendAutomationEmail (unsubscribe link + one-click headers,
 *      unsubscribes, the email channel switch, quiet hours → deferred,
 *      recipient language); in-app + push through notify (quiet hours);
 *      WhatsApp only through notify's consented, official channel;
 *   5. a run-log row (nudge_log) the admin can inspect — ids and outcomes only,
 *      never addresses, names or message text.
 */
import 'server-only'
import { createHash } from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'
import { claimOnce, releaseClaim } from '../store'
import { sendAutomationEmail, type AutomationMail, type MailOutcome } from '../mailer'
import type { OutboundText } from '@/lib/i18n/outbound'
import { capAllows, type NudgePriority } from './rules'
import { getNudgeSettings } from './settings'

export type NudgeOutcome = 'sent' | 'stopped' | 'capped' | 'duplicate' | 'skipped' | 'failed'

export interface NudgeInApp {
  type: string
  title: string
  message: string
  title_i18n?: OutboundText
  message_i18n?: OutboundText | OutboundText[]
  link?: string
  icon?: string
  skip_push?: boolean
}

export interface NudgeMessage {
  automationId: string
  /** Idempotency key for this one message (ids only, never an email address). */
  key: string
  to: { userId?: string | null; email?: string | null }
  tenantId?: string | null
  priority?: NudgePriority
  /** Not limited by / not counted in the shared cap (pre-charge notices, staff digests). */
  capExempt?: boolean
  email?: Omit<AutomationMail, 'to' | 'userId' | 'onceKey'> | null
  inApp?: NudgeInApp | null
  /** Also WhatsApp (people who agreed only, official templates; needs inApp + a user id). */
  whatsapp?: boolean
  stillDue?: () => Promise<boolean>
  now?: Date
}

const LEDGER = 'nudge_ledger'
const LOG = 'nudge_log'
const SENT_MAIL: ReadonlySet<MailOutcome> = new Set(['sent', 'deferred', 'queued'])

let indexes: Promise<unknown> | null = null
async function db() {
  const d = await getMongoDb()
  if (!indexes) {
    indexes = Promise.all([
      d.collection(LEDGER).createIndex({ subject: 1, at: -1 }, { name: 'nudge_ledger_subject' }),
      d.collection(LEDGER).createIndex({ at: 1 }, { expireAfterSeconds: 14 * 86_400, name: 'nudge_ledger_ttl' }),
      d.collection(LOG).createIndex({ automation_id: 1, at: -1 }, { name: 'nudge_log_automation' }),
      d.collection(LOG).createIndex({ at: 1 }, { expireAfterSeconds: 60 * 86_400, name: 'nudge_log_ttl' }),
    ]).catch(() => { indexes = null })
  }
  await indexes
  return d
}

/** Who the cap is counted for: the account, else a hash of the address (no raw email stored). */
export function capSubject(to: NudgeMessage['to']): string | null {
  if (to.userId) return `u:${to.userId}`
  const e = String(to.email || '').trim().toLowerCase()
  return e ? `e:${createHash('sha256').update(e).digest('hex').slice(0, 32)}` : null
}

async function log(m: NudgeMessage, outcome: NudgeOutcome, detail: { channels?: string[]; reason?: string } = {}): Promise<void> {
  try {
    await (await db()).collection(LOG).insertOne({
      automation_id: m.automationId,
      ref: createHash('sha256').update(m.key).digest('hex').slice(0, 16),
      outcome,
      channels: detail.channels || [],
      reason: detail.reason || null,
      tenant_id: m.tenantId || null,
      at: m.now || new Date(),
    })
  } catch { /* the log never blocks a send */ }
}

export async function deliverNudge(m: NudgeMessage): Promise<NudgeOutcome> {
  const now = m.now || new Date()
  const subject = capSubject(m.to)
  if (!subject || (!m.email && !m.inApp)) {
    await log(m, 'skipped', { reason: 'no_recipient' })
    return 'skipped'
  }
  const onceKey = `nudge:${m.automationId}:${m.key}`
  if (!(await claimOnce(onceKey))) return 'duplicate'
  try {
    if (m.stillDue && !(await m.stillDue())) {
      await log(m, 'stopped', { reason: 'acted' })
      return 'stopped'
    }
    const d = await db()
    if (!m.capExempt) {
      const caps = await getNudgeSettings()
      const history = (await d.collection(LEDGER).find({ subject, at: { $gte: new Date(now.getTime() - 7 * 86_400_000) } }, { projection: { _id: 0, at: 1 } }).limit(100).toArray())
        .map((r) => ({ at: (r.at instanceof Date ? r.at : new Date(String(r.at))).toISOString() }))
      const cap = capAllows(history, now, { daily: caps.cap_daily, weekly: caps.cap_weekly }, m.priority)
      if (!cap.ok) {
        await releaseClaim(onceKey)
        await log(m, 'capped', { reason: cap.reason })
        return 'capped'
      }
    }
    const channels: string[] = []
    if (m.email && m.to.email) {
      const r = await sendAutomationEmail({ ...m.email, to: m.to.email, userId: m.to.userId ?? null })
      if (SENT_MAIL.has(r)) channels.push('email')
    }
    if (m.inApp && m.to.userId) {
      const { notify } = await import('@/lib/notifications')
      const n = await notify({ user_id: m.to.userId, ...m.inApp, ...(m.whatsapp ? { send_whatsapp: true } : {}) })
      if (n) channels.push(m.whatsapp ? 'in_app+whatsapp' : 'in_app')
    }
    if (!channels.length) {
      await log(m, 'skipped', { reason: 'opted_out_or_no_channel' })
      return 'skipped'
    }
    if (!m.capExempt) await d.collection(LEDGER).insertOne({ subject, automation_id: m.automationId, priority: m.priority || 'normal', at: now })
    await log(m, 'sent', { channels })
    return 'sent'
  } catch (e) {
    await releaseClaim(onceKey)
    await log(m, 'failed', { reason: (e as Error)?.message?.slice(0, 120) || 'error' })
    return 'failed'
  }
}

/** Tally of outcomes for a sweep result. */
export function tally(outcomes: NudgeOutcome[]): Record<NudgeOutcome, number> {
  const t = { sent: 0, stopped: 0, capped: 0, duplicate: 0, skipped: 0, failed: 0 }
  for (const o of outcomes) t[o]++
  return t
}

export interface NudgeLogRow { automation_id: string; ref: string; outcome: NudgeOutcome; channels: string[]; reason: string | null; tenant_id: string | null; at: string }

/** Admin run log: latest rows (optionally one automation) + 7-day outcome counts per automation. */
export async function nudgeLog(opts: { automationId?: string | null; limit?: number } = {}): Promise<{ rows: NudgeLogRow[]; week: Record<string, Partial<Record<NudgeOutcome, number>>> }> {
  const d = await db()
  const filter = opts.automationId ? { automation_id: opts.automationId } : {}
  const rows = (await d.collection(LOG).find(filter, { projection: { _id: 0 } }).sort({ at: -1 }).limit(Math.min(200, Math.max(1, opts.limit || 50))).toArray())
    .map((r) => ({ ...r, at: (r.at instanceof Date ? r.at : new Date(String(r.at))).toISOString() })) as unknown as NudgeLogRow[]
  const agg = await d.collection(LOG).aggregate<{ _id: { a: string; o: NudgeOutcome }; n: number }>([
    { $match: { at: { $gte: new Date(Date.now() - 7 * 86_400_000) } } },
    { $group: { _id: { a: '$automation_id', o: '$outcome' }, n: { $sum: 1 } } },
  ]).toArray()
  const week: Record<string, Partial<Record<NudgeOutcome, number>>> = {}
  for (const g of agg) (week[g._id.a] ||= {})[g._id.o] = g.n
  return { rows, week }
}
