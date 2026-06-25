/**
 * Merges `pricing_tiers` (admin-managed) with static `BILLING_PLANS` defaults for features / fallbacks.
 * Used by public marketing, dashboard billing, and simulated checkout amounts.
 */
import { BILLING_PLANS, type BillingInterval, type BillingPlanId } from '@/lib/billing-catalog'
import { getServiceSupabase } from '@/lib/admin-service-client'

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

  const supabase = getServiceSupabase()
  if (!supabase) {
    return ids.map(toStatic)
  }

  const { data: tiers, error } = await supabase
    .from('pricing_tiers')
    .select('name, description, display_name, price_monthly, price_yearly, is_active, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error || !tiers?.length) {
    return ids.map(toStatic)
  }

  const tierByPlan = new Map<BillingPlanId, (typeof tiers)[0]>()
  for (const t of tiers) {
    const pid = inferPlanIdFromTierName(String(t.name))
    if (pid && !tierByPlan.has(pid)) tierByPlan.set(pid, t)
  }

  return ids.map((id) => {
    const s = staticById.get(id)!
    const t = tierByPlan.get(id)
    if (!t) return toStatic(id)

    const monthlyUsd = centsToUsd(t.price_monthly)
    let yearlyUsd = centsToUsd(t.price_yearly)
    if ((yearlyUsd === 0 || Number.isNaN(yearlyUsd)) && monthlyUsd > 0) {
      yearlyUsd = Math.round(monthlyUsd * 12 * 0.85 * 100) / 100
    }
    if (yearlyUsd === 0) yearlyUsd = s.yearlyUsd

    return {
      id,
      name: (t.display_name && String(t.display_name).trim()) || String(t.name || s.name),
      description: (t.description && String(t.description).trim()) || s.description,
      monthlyUsd,
      yearlyUsd,
      features: s.features,
      popular: s.popular,
    }
  })
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
