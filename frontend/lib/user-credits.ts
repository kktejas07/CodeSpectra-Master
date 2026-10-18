/**
 * AI credits. The monthly allowance comes from the effective plan
 * (lib/entitlements.ts — the active subscription, not `user.plan`).
 *
 * Credits are only ever spent server-side, inside the AI route that does the
 * work, with an atomic conditional `$inc` (never below zero, never negative
 * amounts). Charge after the AI call succeeds, or refund on failure.
 */
import 'server-only'
import { users } from '@/lib/db/admin'
import { getUserEntitlements, userIdFilter } from '@/lib/entitlements'
import { aiAllowanceFor, aiCreditCost, assertCreditAmount, creditPeriod, DEFAULT_AI_ALLOWANCE, type AiCreditFeature } from '@/lib/entitlements-core'

export const FREE_AI_CREDITS = DEFAULT_AI_ALLOWANCE.free
export const PRO_AI_CREDITS = DEFAULT_AI_ALLOWANCE.pro
export const ENTERPRISE_AI_CREDITS = DEFAULT_AI_ALLOWANCE.enterprise

function nextReset(now = new Date()): Date {
  const d = new Date(now)
  d.setMonth(d.getMonth() + 1)
  return d
}

/** Current balance (starting a new period when due or when the plan changed). */
export async function getUserAiCredits(userId: string): Promise<{ balance: number; plan: string; allowance: number; resets_at: string | null }> {
  const col = await users()
  const user = (await col.findOne(userIdFilter(userId), {
    projection: { aiCredits: 1, creditsResetAt: 1, creditsPlan: 1 },
  })) as { aiCredits?: unknown; creditsResetAt?: unknown; creditsPlan?: unknown } | null
  if (!user) return { balance: 0, plan: 'free', allowance: 0, resets_at: null }

  const ent = await getUserEntitlements(userId)
  const allowance = aiAllowanceFor(ent.plan)
  const period = creditPeriod({
    balance: user.aiCredits,
    resetAt: user.creditsResetAt,
    creditsPlan: user.creditsPlan,
    planKey: ent.planKey,
    allowance,
  })
  let resetsAt = user.creditsResetAt instanceof Date
    ? user.creditsResetAt
    : user.creditsResetAt ? new Date(String(user.creditsResetAt)) : null
  if (period.reset) {
    resetsAt = nextReset()
    await col.updateOne(userIdFilter(userId), {
      $set: { aiCredits: period.balance, creditsResetAt: resetsAt, creditsPlan: ent.planKey },
    })
  }
  return {
    balance: period.balance,
    plan: ent.planKey,
    allowance,
    resets_at: resetsAt && Number.isFinite(resetsAt.getTime()) ? resetsAt.toISOString() : null,
  }
}

export type SpendResult = { ok: true; balance: number } | { ok: false; balance: number }

/**
 * Atomically take `amount` credits. Fails (ok: false) when the balance is too
 * low; throws RangeError for a non-positive / non-integer amount.
 */
export async function spendAiCredits(userId: string, amount = 1): Promise<SpendResult> {
  const n = assertCreditAmount(amount)
  const { balance } = await getUserAiCredits(userId) // starts the period if due
  if (balance < n) return { ok: false, balance }
  const col = await users()
  const res = await col.findOneAndUpdate(
    { $and: [userIdFilter(userId), { aiCredits: { $gte: n } }] } as never,
    { $inc: { aiCredits: -n } } as never,
    { returnDocument: 'after', projection: { aiCredits: 1 } },
  )
  const after = res as unknown as { aiCredits?: number } | null
  if (!after) return { ok: false, balance }
  return { ok: true, balance: Number(after.aiCredits ?? 0) }
}

/** Give back credits taken by spendAiCredits when the AI call failed. */
export async function refundAiCredits(userId: string, amount = 1): Promise<void> {
  const n = assertCreditAmount(amount)
  await (await users()).updateOne(userIdFilter(userId), { $inc: { aiCredits: n } } as never)
}

export type ChargeResult =
  | { ok: true; cost: number; balance: number; refund: () => Promise<void> }
  | { ok: false; cost: number; balance: number }

/**
 * Charge one use of an AI feature up front (atomic, from AI_CREDIT_COSTS).
 * Call `refund()` if the AI work then fails, so a failed call costs nothing.
 */
export async function chargeAiFeature(userId: string, feature: AiCreditFeature): Promise<ChargeResult> {
  const cost = aiCreditCost(feature)
  const spent = await spendAiCredits(userId, cost)
  if (!spent.ok) return { ok: false, cost, balance: spent.balance }
  let refunded = false
  return {
    ok: true,
    cost,
    balance: spent.balance,
    refund: async () => {
      if (refunded) return
      refunded = true
      try { await refundAiCredits(userId, cost) } catch (e) { console.error('[credits] refund failed:', e) }
    },
  }
}

/** Standard 402 body for an out-of-credits AI call. */
export function outOfCredits(r: { cost: number; balance: number }) {
  return { error: 'You are out of AI credits', balance: r.balance, required: r.cost }
}
