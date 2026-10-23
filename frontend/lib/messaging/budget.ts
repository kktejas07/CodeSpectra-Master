/**
 * The shared per-person messaging budget (AUTO-094, server only).
 *
 * Every outbound message to a learner or candidate is admitted here first —
 * deliverNudge, sendAutomationEmail (automations, org workflows, assistants)
 * and notify() (bell + push + email + WhatsApp) all call admitMessage:
 *
 *   1. de-duplication by (person, topic, object) when the sender names a topic
 *      and object — two different automations that mean the same thing (mentor
 *      feedback, the Monday report, a renewal reminder) reach a person once;
 *      applies to every class, receipts included;
 *   2. the shared cap (Admin → Automations → Nudge limits, rolling 24 h / 7 d)
 *      for capped classes (engagement, marketing, digest, deadline +1/day);
 *      transactional / security / payment / legal bypass it;
 *   3. commit() after something actually went out records it in nudge_ledger
 *      (capped classes only); release() undoes the dedupe claim when nothing did.
 *
 * ponytail: the cap check and the ledger write aren't one transaction, so two
 * senders racing in the same millisecond can both pass; the next one is held.
 */
import 'server-only'
import { createHash } from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'
import { claimOnce, releaseClaim } from '@/lib/automation/store'
import { getNudgeSettings } from '@/lib/automation/nudges/settings'
import { budgetAllows, isCapped, messageDedupeKey, messageDedupePrefix, type MessageClass } from './budget-rules'

export type { MessageClass } from './budget-rules'

export interface MessageBudget {
  class: MessageClass
  /** What it is about ("mentor-feedback", "plan-renewal", "weekly-hiring-report"). With `object`, sent once per person. */
  topic?: string | null
  /** Which thing (booking id, subscription:period end, ISO week). Ids only. */
  object?: string | null
  /** Who sent it (for the ledger / admin log). */
  source?: string | null
}

export interface Recipient { userId?: string | null; email?: string | null }

export type Admission =
  | { ok: true; commit: () => Promise<void>; release: () => Promise<void> }
  | { ok: false; outcome: 'duplicate' | 'capped'; reason?: string }

const LEDGER = 'nudge_ledger'
let indexes: Promise<unknown> | null = null
async function ledger() {
  const d = await getMongoDb()
  if (!indexes) {
    indexes = Promise.all([
      d.collection(LEDGER).createIndex({ subject: 1, at: -1 }, { name: 'nudge_ledger_subject' }),
      d.collection(LEDGER).createIndex({ at: 1 }, { expireAfterSeconds: 14 * 86_400, name: 'nudge_ledger_ttl' }),
    ]).catch(() => { indexes = null })
  }
  await indexes
  return d.collection(LEDGER)
}

/** Who the budget is counted for: the account, else a hash of the address (no raw email stored). */
export function capSubject(to: Recipient): string | null {
  if (to.userId) return `u:${to.userId}`
  const e = String(to.email || '').trim().toLowerCase()
  return e ? `e:${createHash('sha256').update(e).digest('hex').slice(0, 32)}` : null
}

async function history(subject: string, now: Date): Promise<{ at: string }[]> {
  const rows = await (await ledger()).find({ subject, at: { $gte: new Date(now.getTime() - 7 * 86_400_000) } }, { projection: { _id: 0, at: 1 } }).limit(100).toArray()
  return rows.map((r) => ({ at: (r.at instanceof Date ? r.at : new Date(String(r.at))).toISOString() }))
}

/** Would a message of this class fit the person's budget right now? Read only (e.g. before minting a coupon). */
export async function budgetHasRoom(to: Recipient, cls: MessageClass, now = new Date()): Promise<boolean> {
  const subject = capSubject(to)
  if (!subject || !isCapped(cls)) return true
  const caps = await getNudgeSettings()
  return budgetAllows(cls, await history(subject, now), now, { daily: caps.cap_daily, weekly: caps.cap_weekly }).ok
}

/**
 * Latest message about this topic to this person whose object starts with
 * `objectPrefix` (e.g. "sub_1:2026-11-01") and which sender sent it — so an
 * admin reviewing a proposal sees "already reminded by plan-expiry on …".
 */
export async function lastTopicSend(to: Recipient, topic: string, objectPrefix: string): Promise<{ at: string; source: string | null } | null> {
  const subject = capSubject(to)
  if (!subject) return null
  const prefix = messageDedupePrefix(topic, objectPrefix).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rows = await (await getMongoDb()).collection('automation_sends')
    .find({ key: { $regex: `^${prefix}` } }, { projection: { _id: 0, key: 1, created_at: 1, source: 1 } })
    .sort({ created_at: -1 }).limit(20).toArray().catch(() => [])
  const hit = rows.find((r) => String(r.key).endsWith(`:${subject}`))
  return hit ? { at: String(hit.created_at || ''), source: typeof hit.source === 'string' ? hit.source : null } : null
}

export async function admitMessage(to: Recipient, b: MessageBudget, now = new Date()): Promise<Admission> {
  const subject = capSubject(to)
  const noop = async () => {}
  if (!subject) return { ok: true, commit: noop, release: noop }
  const dKey = b.topic && b.object ? messageDedupeKey(subject, b.topic, b.object) : null
  if (dKey && !(await claimOnce(dKey, { source: b.source || null }))) return { ok: false, outcome: 'duplicate' }
  const release = async () => { if (dKey) await releaseClaim(dKey) }
  if (isCapped(b.class)) {
    try {
      const caps = await getNudgeSettings()
      const v = budgetAllows(b.class, await history(subject, now), now, { daily: caps.cap_daily, weekly: caps.cap_weekly })
      if (!v.ok) {
        await release()
        return { ok: false, outcome: 'capped', reason: v.reason }
      }
    } catch (e) {
      await release()
      throw e
    }
  }
  return {
    ok: true,
    release,
    commit: async () => {
      if (!isCapped(b.class)) return
      await (await ledger()).insertOne({ subject, automation_id: b.source || null, class: b.class, topic: b.topic || null, priority: b.class === 'deadline' ? 'high' : 'normal', at: now }).catch(() => {})
    },
  }
}

export type BudgetedOutcome = 'sent' | 'duplicate' | 'capped' | 'skipped'

/**
 * One logical message over several channels (email + bell + WhatsApp): admit
 * once, run `send` (whose senders get `budget: false`), then record it when
 * `send` reports something went out, or undo the claim when nothing did.
 */
export async function withBudget(to: Recipient, b: MessageBudget, send: () => Promise<boolean>, now = new Date()): Promise<BudgetedOutcome> {
  const a = await admitMessage(to, b, now)
  if (!a.ok) return a.outcome
  let ok = false
  try {
    ok = await send()
  } finally {
    if (ok) await a.commit()
    else await a.release()
  }
  return ok ? 'sent' : 'skipped'
}
