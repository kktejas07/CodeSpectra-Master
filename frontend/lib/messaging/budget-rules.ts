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
 *                study-plan nudges, cohort nudges, digests, win-back offers).
 */
import { capAllows, type NudgeCaps, type NudgePriority } from '@/lib/automation/nudges/rules'

export const MESSAGE_CLASSES = ['transactional', 'security', 'payment', 'legal', 'deadline', 'engagement', 'marketing', 'digest'] as const
export type MessageClass = (typeof MESSAGE_CLASSES)[number]

const UNCAPPED: ReadonlySet<MessageClass> = new Set(['transactional', 'security', 'payment', 'legal'])

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

/** May this message go out given the person's earlier capped messages? Uncapped classes always may. */
export function budgetAllows(cls: MessageClass, history: readonly { at: string }[], now: Date, caps: NudgeCaps): BudgetVerdict {
  if (!isCapped(cls)) return { ok: true }
  return capAllows(history, now, caps, classPriority(cls))
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
