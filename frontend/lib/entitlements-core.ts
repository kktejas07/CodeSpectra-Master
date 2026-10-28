/**
 * Pure entitlement rules (no DB, no server-only) so they can be unit tested.
 * The DB-backed resolver lives in lib/entitlements.ts.
 *
 * One rule for "which plan does this user have":
 *   1. an active, unexpired `billing_subscriptions` row (what the user paid for)
 *   2. otherwise `user.plan` (admin override / legacy field)
 *   3. otherwise 'free'
 * When both exist, the higher tier wins, so an admin override never takes away
 * a paid plan and a paid plan never hides an enterprise override.
 */
import { getDefaultPlans, type PlanDefinition, type PlanFeature } from '@/lib/plans-client'

export type EntitlementSource = 'subscription' | 'licence' | 'override' | 'default'

export interface SubscriptionLike {
  plan_id?: string | null
  status?: string | null
  ends_at?: string | null
}

/** Count limits enforced by the server (keys on PlanDefinition.features). */
export const LIMIT_KEYS = [
  'max_scans_per_day',
  'max_challenges',
  'max_seats',
  'max_assessments_per_month',
  'max_candidate_invites_per_month',
  'ai_credits_per_month',
] as const
export type LimitKey = (typeof LIMIT_KEYS)[number]

/** Monthly AI credit allowance when a plan does not set `ai_credits_per_month`. */
export const DEFAULT_AI_ALLOWANCE: Record<string, number> = {
  free: 10,
  pro: 1000,
  enterprise: 5000,
}

const TIER_RANK: Record<string, number> = { free: 0, pro: 1, enterprise: 2 }

/**
 * Map a stored plan id (billing order / subscription / user.plan) to the key
 * used in the `plans` collection. Legacy checkout ids (pro_monthly,
 * pro_yearly) map to `pro`. One-time packs are not plans and return null.
 */
export function normalizePlanKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const id = raw.trim().toLowerCase()
  if (!id || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) return null
  if (id === 'problem_pack_50' || id.startsWith('pack_') || id.startsWith('problem_pack')) return null
  if (id === 'pro_monthly' || id === 'pro_yearly' || id === 'pro_annual') return 'pro'
  if (id === 'enterprise_monthly' || id === 'enterprise_yearly') return 'enterprise'
  return id
}

function rank(key: string): number {
  // Unknown (admin-created) paid plan keys rank between pro and enterprise:
  // above free, never above an explicit enterprise grant.
  return key in TIER_RANK ? TIER_RANK[key] : 1.5
}

/** Highest tier among plan keys (used for an organisation's plan). */
export function highestPlanKey(keys: Array<string | null | undefined>): string {
  let best = 'free'
  for (const k of keys) {
    const n = normalizePlanKey(k)
    if (n && rank(n) > rank(best)) best = n
  }
  return best
}

export function isSubscriptionLive(sub: SubscriptionLike | null | undefined, now: Date = new Date()): boolean {
  if (!sub || sub.status !== 'active' || !sub.ends_at) return false
  const end = Date.parse(sub.ends_at)
  return Number.isFinite(end) && end > now.getTime()
}

/** Decide the effective plan key from the subscription and the user doc. */
export function pickEffectivePlanKey(input: {
  subscription?: SubscriptionLike | null
  userPlan?: unknown
  /** Plan granted by a live college / company licence seat (lib/billing/licences.ts). */
  licencePlan?: string | null
  now?: Date
}): { key: string; source: EntitlementSource } {
  const now = input.now ?? new Date()
  const ownKey = isSubscriptionLive(input.subscription, now) ? normalizePlanKey(input.subscription!.plan_id) : null
  const seatKey = normalizePlanKey(input.licencePlan)
  // A paid subscription and a licence seat: the higher tier wins (the subscription on a tie).
  const useSeat = !!seatKey && seatKey !== 'free' && (!ownKey || ownKey === 'free' || rank(seatKey) > rank(ownKey))
  const subKey = useSeat ? seatKey : ownKey
  const subSource: EntitlementSource = useSeat ? 'licence' : 'subscription'
  const overrideKey = normalizePlanKey(input.userPlan)
  const usableOverride = overrideKey && overrideKey !== 'free' ? overrideKey : null

  if (subKey && subKey !== 'free') {
    if (usableOverride && rank(usableOverride) > rank(subKey)) return { key: usableOverride, source: 'override' }
    return { key: subKey, source: subSource }
  }
  if (usableOverride) return { key: usableOverride, source: 'override' }
  return { key: 'free', source: 'default' }
}

/**
 * The plan definition to enforce: the admin's `plans` document when there is
 * one, with any feature it lacks filled from the built-in default for the same
 * key (or the free defaults for an unknown key — deny by default).
 */
export function mergePlanDefinition(key: string, dbPlan: PlanDefinition | null | undefined): PlanDefinition {
  const defaults = getDefaultPlans()
  const base = defaults.find((p) => p.plan === key) ?? defaults.find((p) => p.plan === 'free')!
  if (!dbPlan) return { ...base, plan: key }
  const dbFeatures: PlanFeature[] = Array.isArray(dbPlan.features)
    ? dbPlan.features.filter((f): f is PlanFeature => !!f && typeof f === 'object' && typeof (f as PlanFeature).key === 'string')
    : []
  const have = new Set(dbFeatures.map((f) => f.key))
  return {
    ...dbPlan,
    plan: key,
    features: [...dbFeatures, ...base.features.filter((f) => !have.has(f.key))],
  }
}

/**
 * Numeric limit for a count feature: Infinity = unlimited, 0 = not allowed.
 * `limit` of -1 (or 0 on an enabled feature) means unlimited, matching
 * lib/plans-client getFeatureLimit and the admin plan editor.
 */
export function limitFor(plan: PlanDefinition, key: string): number {
  const f = plan.features.find((x) => x.key === key)
  if (!f) {
    if (key === 'ai_credits_per_month') return DEFAULT_AI_ALLOWANCE[plan.plan] ?? DEFAULT_AI_ALLOWANCE.free
    return 0
  }
  if (!f.enabled) return 0
  if (f.limit === -1 || f.limit === 0 || f.limit === undefined || f.limit === null) return Infinity
  const n = Number(f.limit)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

export function featureEnabled(plan: PlanDefinition, key: string): boolean {
  return plan.features.find((f) => f.key === key)?.enabled === true
}

/** Monthly AI credits for a plan. Unlimited plans get a high finite cap. */
export function aiAllowanceFor(plan: PlanDefinition): number {
  const n = limitFor(plan, 'ai_credits_per_month')
  if (n === Infinity) return 100_000
  return n
}

/** `used + requested <= limit`, with Infinity = unlimited. */
export function withinLimit(limit: number, used: number, requested = 1): boolean {
  if (limit === Infinity) return true
  return used + requested <= limit
}

export const MAX_CREDIT_SPEND = 100

/**
 * AI credit cost per feature — the one table every AI route charges from.
 * A mock interview is charged once, when the session starts.
 */
export const AI_CREDIT_COSTS = {
  chat: 1,
  code_review: 1,
  code_analysis: 1,
  grade: 1,
  hints: 1,
  mock_interview: 3,
  resume_summary: 1,
  mock_test: 1,
  interview_prep: 1,
  course: 1,
  fixes: 1,
} as const

export type AiCreditFeature = keyof typeof AI_CREDIT_COSTS

/** Cost of one use of an AI feature (unknown features cost 1, never 0). */
export function aiCreditCost(feature: string): number {
  const v = (AI_CREDIT_COSTS as Record<string, number>)[feature]
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : 1
}

/** A credit spend must be a positive integer within a sane cap (no minting). */
export function assertCreditAmount(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > MAX_CREDIT_SPEND) {
    throw new RangeError('Credit amount must be an integer between 1 and ' + MAX_CREDIT_SPEND)
  }
  return raw
}

/**
 * Balance for a user doc at read time: a missing balance, a passed reset date
 * or a plan change starts a fresh period at the plan's allowance.
 */
export function creditPeriod(input: {
  balance: unknown
  resetAt: unknown
  creditsPlan: unknown
  planKey: string
  allowance: number
  now?: Date
}): { balance: number; reset: boolean } {
  const now = input.now ?? new Date()
  const resetAt = input.resetAt instanceof Date ? input.resetAt.getTime() : Date.parse(String(input.resetAt ?? ''))
  const balance = typeof input.balance === 'number' && Number.isFinite(input.balance) ? input.balance : null
  const expired = !Number.isFinite(resetAt) || resetAt < now.getTime()
  // Legacy docs have no creditsPlan: they were sized for the free tier unless
  // user.plan said otherwise, so a paid plan starts a fresh paid period.
  const planChanged = typeof input.creditsPlan === 'string'
    ? input.creditsPlan !== input.planKey
    : input.planKey !== 'free'
  if (balance === null || expired || planChanged) return { balance: input.allowance, reset: true }
  return { balance: Math.max(0, balance), reset: false }
}

// ─── Problem packs ──────────────────────────────────────────────────────────

export interface PackRule {
  id: string
  name: string
  problem_slugs?: string[] | null
  topics?: string[] | null
  included_in_plans?: string[] | null
  /** On sale (only packs on sale are offered as "Unlock with …"). */
  active?: boolean | null
}

export interface ProblemRef {
  id?: string | null
  slug: string
  topics?: string[] | null
}

export interface ProblemAccess {
  locked: boolean
  /** Pack to offer when locked (an on-sale pack that contains the problem), else null. */
  unlockWith: { id: string; name: string } | null
  /** Every pack the problem belongs to. */
  packIds: string[]
}

const lc = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '')

/** Packs that contain a problem: listed by slug / id, or sharing a topic. */
export function packsContaining(problem: ProblemRef, packs: PackRule[]): PackRule[] {
  const slug = lc(problem.slug)
  const id = lc(problem.id)
  const topics = new Set((problem.topics || []).map(lc).filter(Boolean))
  return packs.filter((p) => {
    const slugs = (p.problem_slugs || []).map(lc)
    if ((slug && slugs.includes(slug)) || (id && slugs.includes(id))) return true
    return (p.topics || []).some((t) => topics.has(lc(t)))
  })
}

/**
 * The access rule: a problem in no pack is open to everyone. A problem in a
 * pack is locked unless the user bought one of its packs (purchases never
 * expire), their plan is included in one of its packs, or they are staff
 * (superadmin / the problem's editor). Deny by default otherwise.
 */
export function problemAccess(input: {
  problem: ProblemRef
  packs: PackRule[]
  purchasedPacks?: unknown
  planKey?: string | null
  bypass?: boolean
}): ProblemAccess {
  const containing = packsContaining(input.problem, input.packs)
  const packIds = containing.map((p) => p.id)
  if (containing.length === 0 || input.bypass) return { locked: false, unlockWith: null, packIds }

  const owned = new Set(Array.isArray(input.purchasedPacks) ? input.purchasedPacks.map(lc) : [])
  if (containing.some((p) => owned.has(lc(p.id)))) return { locked: false, unlockWith: null, packIds }

  const plan = normalizePlanKey(input.planKey ?? '') || 'free'
  if (containing.some((p) => (p.included_in_plans || []).map(lc).includes(plan))) {
    return { locked: false, unlockWith: null, packIds }
  }

  const offer = containing.find((p) => p.active !== false)
  return { locked: true, unlockWith: offer ? { id: offer.id, name: offer.name } : null, packIds }
}
