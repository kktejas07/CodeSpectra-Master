/**
 * Learner entitlements (pure, client-safe catalog). Every gated feature asks
 * `hasEntitlement(user, feature)` (lib/entitlements.ts), which reads the
 * user's effective plan (paid subscription, licence seat, admin override) and
 * the limit below from that plan's admin-editable `features`.
 *
 * Plan feature keys are stored on the `plans` documents; a plan that lacks a
 * key gets the built-in default for that plan (lib/plans-client getDefaultPlans).
 */
import type { PlanDefinition } from '@/lib/plans-client'
import { limitFor } from '@/lib/entitlements-core'

export const LEARNER_FEATURES = {
  /** Mock interview simulator sessions a learner may start per day. */
  interview_sim_sessions_per_day: { type: 'count', free: 1, pro: 5, enterprise: -1 },
  /** Company practice tests at the Tough level. */
  company_tests_tough: { type: 'boolean', free: false, pro: true, enterprise: true },
  /** AI-written notes in the personal study plan (template notes otherwise). */
  study_plan_ai_notes: { type: 'boolean', free: false, pro: true, enterprise: true },
  /** % off mentor / mock-interview sessions in the marketplace (platform-funded). */
  mentor_discount_pct: { type: 'count', free: 0, pro: 10, enterprise: 15 },
  /** % off certification items in the marketplace (platform-funded). */
  cert_discount_pct: { type: 'count', free: 0, pro: 20, enterprise: 25 },
  /** Download practice packs for offline use. */
  offline_packs: { type: 'boolean', free: false, pro: true, enterprise: true },
  /** Join cohort courses marked "included with the plan" without paying. */
  cohort_courses: { type: 'boolean', free: false, pro: false, enterprise: true },
} as const

export type LearnerFeature = keyof typeof LEARNER_FEATURES

export function isLearnerFeature(v: unknown): v is LearnerFeature {
  return typeof v === 'string' && v in LEARNER_FEATURES
}

export interface EntitlementDecision {
  allowed: boolean
  /** Count features: the limit (Infinity = unlimited, 0 = none). Boolean features: 1 or 0. */
  limit: number
  planKey: string
}

/** The decision for one feature on a resolved plan. Superadmins are never gated. */
export function decideEntitlement(plan: PlanDefinition, feature: LearnerFeature, opts: { superadmin?: boolean } = {}): EntitlementDecision {
  if (opts.superadmin) return { allowed: true, limit: Infinity, planKey: plan.plan }
  const def = LEARNER_FEATURES[feature]
  if (def.type === 'boolean') {
    const f = plan.features.find((x) => x.key === feature)
    const on = f ? f.enabled === true : (def as Record<string, unknown>)[plan.plan] === true
    return { allowed: on, limit: on ? 1 : 0, planKey: plan.plan }
  }
  const row = plan.features.find((x) => x.key === feature)
  const fallback = Number((def as Record<string, unknown>)[plan.plan] ?? def.free)
  const limit = row ? limitFor(plan, feature) : fallback === -1 ? Infinity : Math.max(0, fallback)
  // Percent features cap at 100.
  const capped = feature.endsWith('_pct') ? (limit === Infinity ? 0 : Math.min(100, limit)) : limit
  return { allowed: capped > 0, limit: capped, planKey: plan.plan }
}

/** Plan feature rows to merge into the built-in default plans (labels shown in the admin editor). */
export function learnerFeatureRows(planKey: 'free' | 'pro' | 'enterprise') {
  const LABELS: Record<LearnerFeature, [string, string]> = {
    interview_sim_sessions_per_day: ['Mock interviews per day', 'Interview simulator sessions a learner can start per day'],
    company_tests_tough: ['Tough company tests', 'Company practice tests at the Tough level'],
    study_plan_ai_notes: ['AI study-plan notes', 'AI-written notes in the study plan'],
    mentor_discount_pct: ['Mentor discount %', 'Percent off mentor and mock-interview sessions'],
    cert_discount_pct: ['Certification discount %', 'Percent off certification items'],
    offline_packs: ['Offline packs', 'Download practice packs for offline use'],
    cohort_courses: ['Cohort courses included', 'Join cohort courses that are included with the plan'],
  }
  return (Object.keys(LEARNER_FEATURES) as LearnerFeature[]).map((key) => {
    const def = LEARNER_FEATURES[key]
    const v = (def as Record<string, unknown>)[planKey]
    const [label, description] = LABELS[key]
    return def.type === 'boolean'
      ? { key, label, description, enabled: v === true, limit: v === true ? -1 : 0, type: 'boolean' as const }
      : { key, label, description, enabled: Number(v) !== 0, limit: Number(v), type: 'count' as const }
  })
}
