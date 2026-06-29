/**
 * Merges `pricing_tiers` (admin-managed) with static `BILLING_PLANS` defaults for features / fallbacks.
 * Used by public marketing, dashboard billing, and simulated checkout amounts.
 */
import { BILLING_PLANS, type BillingInterval, type BillingPlanId } from '@/lib/billing-catalog'

export type MergedBillingPlan = {
  id: BillingPlanId
  name: string
  description: string
  monthlyUsd: number
  yearlyUsd: number
  features: string[]
  popular?: boolean
}

export function inferPlanIdFromTierName(name: string): BillingPlanId | null {
  const n = name.trim().toLowerCase()
  if (n === 'free' || n === 'starter') return 'free'
  if (n === 'pro') return 'pro'
  if (n === 'enterprise') return 'enterprise'
  return null
}

/** Stripe Price object id from Dashboard (`price_…`). */
export function isStripePriceId(raw: unknown): boolean {
  const s = String(raw ?? '').trim()
  return /^price_[a-zA-Z0-9]+$/.test(s)
}

function centsToUsd(cents: number | null | undefined): number {
  if (cents == null || Number.isNaN(Number(cents))) return 0
  return Math.round(Number(cents)) / 100
}

export async function getMergedBillingPlans(): Promise<MergedBillingPlan[]> {
  const staticById = new Map(BILLING_PLANS.map((p) => [p.id, p]))
  const ids: BillingPlanId[] = ['free', 'pro', 'enterprise']

  const toStatic = (id: BillingPlanId): MergedBillingPlan => {
    const s = staticById.get(id)!
    return {
      id,
      name: s.name,
      description: s.description,
      monthlyUsd: s.monthlyUsd,
      yearlyUsd: s.yearlyUsd,
      features: s.features,
      popular: s.popular,
    }
  }

  return ids.map(toStatic)
}

export async function getMergedPlanById(planId: BillingPlanId): Promise<MergedBillingPlan> {
  const all = await getMergedBillingPlans()
  return all.find((p) => p.id === planId) ?? all[0]
}

export function chargeAmountCentsFromMergedPlan(plan: MergedBillingPlan, interval: BillingInterval): number {
  const usd = interval === 'year' ? plan.yearlyUsd : plan.monthlyUsd
  return Math.round(Number(usd) * 100)
}

/** Shape returned by `/api/billing/plans` and `/api/pricing/plans`. */
export function mergedPlanToClientJson(p: MergedBillingPlan) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.monthlyUsd,
    yearlyPrice: p.yearlyUsd,
    features: p.features,
    popular: Boolean(p.popular),
  }
}
