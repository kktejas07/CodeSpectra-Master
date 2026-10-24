/**
 * Pure rules of the shared per-person messaging budget (AUTO-094). No I/O —
 * unit-tested in tests/messaging-budget.test.ts; the server side is
 * lib/messaging/budget.ts.
 *
 * Every outbound message to a learner or candidate has a class:
 *   transactional / security / payment / legal → never capped (receipts,
 *       sign-in codes, payment failures, pre-debit notices, legally required
 *       notices) but still de-duplicated by (person, topic, object);
 *   deadline   → capped, with one extra slot per day (test closes in 2 h,
 *                drive in an hour, plan ends tomorrow, exam tomorrow);
 *   engagement / marketing / digest → capped (tips, streak saver, come-back,
 *                cohort nudges, the weekly digest, win-back offers);
 *   subscribed → a schedule the person chose themselves (WhatsApp daily
 *                practice, study-plan reminders at their hour, the daily /
 *                news digest, event alerts they subscribed to): never capped
 *                and never counted (AUTO-108 / CORE-050) — the person picked
 *                the frequency — but still de-duplicated, and the sender
 *                still honours quiet hours, unsubscribes and STOP.
 *
 * Deadline reminders get one extra slot per day AND per week, and one deadline
 * reminder a day is always admitted however many tips / offers came first —
 * marketing volume never blocks "your test closes in 2 hours".
 */
import { capAllows, type NudgeCaps, type NudgePriority } from '@/lib/automation/nudges/rules'

export const MESSAGE_CLASSES = ['transactional', 'security', 'payment', 'legal', 'deadline', 'engagement', 'marketing', 'digest', 'subscribed'] as const
export type MessageClass = (typeof MESSAGE_CLASSES)[number]

const UNCAPPED: ReadonlySet<MessageClass> = new Set(['transactional', 'security', 'payment', 'legal', 'subscribed'])

/** Does this class count toward (and get limited by) the shared cap? */
export function isCapped(c: MessageClass): boolean {
  return !UNCAPPED.has(c)
}

/** Deadline reminders get the extra daily slot. */
export function classPriority(c: MessageClass): NudgePriority {
  return c === 'deadline' ? 'high' : 'normal'
}

/** Class for an automation email when the sender didn't name one (by its unsubscribe category). */
export function classForMailCategory(category: string): MessageClass {
  switch (category) {
    case 'engagement': return 'engagement'
    case 'reports': return 'digest'
    case 'events': return 'deadline'
    case 'billing': return 'payment'
    case 'security': return 'security'
    default: return 'transactional' // transactional, hiring, assessment: things they asked for / need
  }
}

/** Same thing, same person: ids only (never an email address — the subject is a user id or an address hash). */
const clean = (s: string) => String(s).replace(/\s+/g, '').slice(0, 120)
export function messageDedupeKey(subject: string, topic: string, object: string): string {
  return `msg:${clean(topic)}:${clean(object)}:${subject}`
}

/** Start of every dedupe key for a topic + object prefix (for "already sent?" look-ups). */
export function messageDedupePrefix(topic: string, objectPrefix: string): string {
  return `msg:${clean(topic)}:${clean(objectPrefix)}`
}

/** UTC day of a moment ("2026-10-23") — object suffix for "at most once a day across senders". */
export const utcDay = (d: Date) => d.toISOString().slice(0, 10)

export type BudgetVerdict = { ok: true } | { ok: false; reason: 'daily_cap' | 'weekly_cap' }

/** One earlier capped message in the person's ledger (class/topic/object when known). */
export interface LedgerEntry { at: string; class?: string | null; topic?: string | null; object?: string | null }

const DAY_MS = 86_400_000

/**
 * May this message go out given the person's earlier capped messages? Uncapped classes always may.
 * Deadline reminders: one extra slot on the daily and the weekly limit, and the first deadline
 * reminder in any 24 hours is always admitted (tips and offers never crowd it out — AUTO-108).
 */
export function budgetAllows(cls: MessageClass, history: readonly LedgerEntry[], now: Date, caps: NudgeCaps): BudgetVerdict {
  if (!isCapped(cls)) return { ok: true }
  if (cls !== 'deadline') return capAllows(history, now, caps, 'normal')
  const t = now.getTime()
  const deadlineToday = history.some((h) => {
    const at = Date.parse(h.at)
    return h.class === 'deadline' && Number.isFinite(at) && at <= t && t - at < DAY_MS
  })
  if (!deadlineToday) return { ok: true }
  return capAllows(history, now, { daily: caps.daily, weekly: Math.max(0, Math.floor(caps.weekly)) + 1 }, 'high')
}

/**
 * Is this the same logical message already counted (another channel of it: the e-mail went, now
 * the WhatsApp)? Then it is admitted without a cap check and not counted again (CORE-051).
 */
export function alreadyCounted(history: readonly LedgerEntry[], topic: string | null | undefined, object: string | null | undefined): boolean {
  if (!topic || !object) return false
  return history.some((h) => h.topic === topic && h.object === object)
}

/** How long a held (capped) job waits before trying again, and when it gives up (AUTO-109). */
export const HELD_RETRY_MS = 6 * 3_600_000
export const HELD_GIVE_UP_MS = 3 * DAY_MS

/** Next try for a job the budget held, or null once it has waited long enough (then it is dropped). */
export function heldRetryAt(createdAt: string | null | undefined, now: Date): Date | null {
  const born = Date.parse(String(createdAt || ''))
  const next = new Date(now.getTime() + HELD_RETRY_MS)
  if (Number.isFinite(born) && next.getTime() - born > HELD_GIVE_UP_MS) return null
  return next
}

/**
 * Class of an organisation-workflow email (AUTO-115). Only a workflow started by a service event
 * (an application, interview, test invite, offer, payment…) may send as 'transactional'; anything
 * else — manual, scheduled, webhook or marketing-style triggers — is engagement mail: it counts
 * toward the shared limit and honours engagement unsubscribes.
 */
const SERVICE_EVENT_PREFIXES = ['candidate.', 'interview.', 'exam.', 'score.', 'offer.', 'bgv.', 'assessment.invite', 'payment.', 'subscription.', 'licence.', 'drive.', 'talent.invite', 'hackathon.registered', 'certificate.issued', 'marketplace.order.', 'mentor.booking.', 'support.ticket']
export function isServiceEvent(eventType: string | null | undefined): boolean {
  const t = String(eventType || '')
  return !!t && SERVICE_EVENT_PREFIXES.some((p) => t.startsWith(p))
}
export function workflowMailClass(requested: string, eventType: string | null | undefined): 'transactional' | 'engagement' {
  return requested === 'transactional' && isServiceEvent(eventType) ? 'transactional' : 'engagement'
}

/** ISO week key ("2026-W43") of a moment, UTC — shared by every weekly report so one per person per week. */
export function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/**
 * Budget object of a dunning step (AUTO-117). Ordinary steps share the revenue assistant's
 * "update your payment method" topic + day, so the person hears it once that day; the final notice
 * has its own object so an assistant reminder can never stand in for it.
 */
export function dunningBudgetObject(subscriptionId: string, episode: string, step: { key: string; final?: boolean }, now: Date): string {
  return step.final ? `${subscriptionId}:final:${episode}` : `${subscriptionId}:${utcDay(now)}`
}
