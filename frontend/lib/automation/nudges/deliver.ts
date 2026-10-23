/**
 * One sender for every Wave 15 nudge (server only).
 *
 *   deliverNudge({ automationId, key, to, email?, inApp?, whatsapp?, stillDue?, priority?, capExempt? })
 *
 * In order:
 *   1. once per `key` (automation_sends ledger) — a sweep that runs twice never sends twice;
 *   2. stop condition: `stillDue()` re-checked right before sending (they acted → nothing);
 *   3. the shared per-person messaging budget (lib/messaging/budget.ts, AUTO-094):
 *      once per (person, topic, object) across every sender, and the shared cap
 *      (nudge_ledger, rolling 24 h / 7 days, Admin → Automations → Nudge limits)
 *      for capped classes. A capped nudge releases its claim so the next sweep
 *      can still send it while its window lasts;
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
import type { NudgePriority } from './rules'
import { admitMessage, capSubject } from '@/lib/messaging/budget'
import type { MessageClass } from '@/lib/messaging/budget-rules'

export { capSubject }

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
  /** Also the generic notification email (for senders without their own email copy, e.g. assistants). */
  send_email?: boolean
}

export interface NudgeMessage {
  automationId: string
  /** Idempotency key for this one message (ids only, never an email address). */
  key: string
  to: { userId?: string | null; email?: string | null }
  tenantId?: string | null
  priority?: NudgePriority
  /** Not limited by / not counted in the shared cap (pre-charge notices, staff digests). Same as class 'transactional'. */
  capExempt?: boolean
  /** Message class for the shared budget; default from capExempt / priority (engagement, or deadline when high). */
  class?: MessageClass
  /** Cross-sender de-duplication: the same (person, topic, object) is sent once whichever automation fires first. */
  topic?: string
  object?: string
  email?: Omit<AutomationMail, 'to' | 'userId' | 'onceKey'> | null
  inApp?: NudgeInApp | null
  /** Also WhatsApp (people who agreed only, official templates; needs inApp + a user id). */
  whatsapp?: boolean
  stillDue?: () => Promise<boolean>
  now?: Date
}

const LOG = 'nudge_log'
const SENT_MAIL: ReadonlySet<MailOutcome> = new Set(['sent', 'deferred', 'queued'])

let indexes: Promise<unknown> | null = null
async function db() {
  const d = await getMongoDb()
  if (!indexes) {
    indexes = Promise.all([
      d.collection(LOG).createIndex({ automation_id: 1, at: -1 }, { name: 'nudge_log_automation' }),
      d.collection(LOG).createIndex({ at: 1 }, { expireAfterSeconds: 60 * 86_400, name: 'nudge_log_ttl' }),
    ]).catch(() => { indexes = null })
  }
  await indexes
  return d
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
    const cls: MessageClass = m.class ?? (m.capExempt ? 'transactional' : m.priority === 'high' ? 'deadline' : 'engagement')
    const admit = await admitMessage(m.to, { class: cls, topic: m.topic, object: m.object, source: m.automationId }, now)
    if (!admit.ok) {
      // Capped: try again on a later sweep. Duplicate: another sender already said it — done.
      if (admit.outcome === 'capped') await releaseClaim(onceKey)
      await log(m, admit.outcome, { reason: admit.reason || 'same_topic_sent' })
      return admit.outcome
    }
    const channels: string[] = []
    try {
      if (m.email && m.to.email) {
        const r = await sendAutomationEmail({ ...m.email, to: m.to.email, userId: m.to.userId ?? null, budget: false })
        if (SENT_MAIL.has(r)) channels.push('email')
      }
      if (m.inApp && m.to.userId) {
        const { notify } = await import('@/lib/notifications')
        // Deadline reminders skip quiet hours on push / WhatsApp too (AUTO-102).
        const n = await notify({ user_id: m.to.userId, ...m.inApp, ...(m.whatsapp ? { send_whatsapp: true } : {}), ...(cls === 'deadline' || m.priority === 'high' ? { urgent: true } : {}), budget: false })
        if (n) channels.push(m.whatsapp ? 'in_app+whatsapp' : 'in_app')
      }
    } catch (e) {
      await admit.release()
      throw e
    }
    if (!channels.length) {
      await admit.release()
      await log(m, 'skipped', { reason: 'opted_out_or_no_channel' })
      return 'skipped'
    }
    await admit.commit()
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
