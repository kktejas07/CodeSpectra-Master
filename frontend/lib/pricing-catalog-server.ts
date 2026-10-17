import 'server-only'
import { getMongoDb } from '@/lib/mongodb'
import { BILLING_PLANS, type BillingPlanId } from '@/lib/billing-catalog'
import { type MergedBillingPlan, mergedPlanToClientJson } from '@/lib/pricing-catalog'
import { parsePlanPrice, planCheckoutMode, type PlanCheckoutMode } from '@/lib/billing-plan-mode'
import { resolveBillingPlan } from '@/lib/billing-plans'

export async function getMergedBillingPlans(): Promise<MergedBillingPlan[]> {
  try {
    const db = await getMongoDb()
    const dbPlans = await db.collection('plans').find({}).toArray()
    if (dbPlans && dbPlans.length > 0) {
      return dbPlans.map((p: any) => {
        const id = p.plan || p.id || p._id?.toString() || 'free'
        const name = p.name || id
        const description = p.description || ''
        // Same parser the checkout uses ("1,499" → 1499, "Contact us" → 0).
        const monthlyUsd = parsePlanPrice(p.price) ?? 0
        const yearlyUsd = typeof p.yearlyPrice === 'number' ? p.yearlyPrice : Math.round(monthlyUsd * 12 * 0.85)
        let features: string[] = []
        if (Array.isArray(p.features)) {
          features = p.features
            .filter((f: any) => typeof f === 'string' ? true : f && f.enabled !== false)
            .map((f: any) => typeof f === 'string' ? f : f.label || f.key)
        }
        return {
          id,
          name,
          description,
          monthlyUsd,
          yearlyUsd,
          features,
          popular: Boolean(p.popular || id === 'pro'),
        }
      })
    }
  } catch (err) {
    console.warn('[CodeSpectra] Could not look up dynamic plans from DB:', err)
  }

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

export async function getMergedPlanById(planId: string | BillingPlanId): Promise<MergedBillingPlan> {
  const all = await getMergedBillingPlans()
  return all.find((p) => p.id === planId) ?? all[0]
}

export type ClientPlanRow = ReturnType<typeof mergedPlanToClientJson> & {
  currency: string | null
  checkout_mode: PlanCheckoutMode
}

/**
 * Plans for the pricing pages, priced by the same resolver checkout charges
 * with (amount, interval and currency), so the displayed price is the charged
 * price (D12) and "Contact us" plans never show as Free (D13).
 */
export async function getClientPlans(): Promise<ClientPlanRow[]> {
  const merged = await getMergedBillingPlans()
  return Promise.all(
    merged.map(async (p) => {
      const id = String(p.id)
      const [month, year] = await Promise.all([
        resolveBillingPlan(id, 'month').catch(() => null),
        resolveBillingPlan(id, 'year').catch(() => null),
      ])
      const checkout_mode = month?.mode ?? planCheckoutMode({ id, price: p.monthlyUsd, yearlyPrice: p.yearlyUsd })
      const base = mergedPlanToClientJson(p)
      return {
        ...base,
        price: checkout_mode === 'checkout' && month ? month.amount_paise / 100 : checkout_mode === 'free' ? 0 : base.price,
        yearlyPrice: checkout_mode === 'checkout' && year ? year.amount_paise / 100 : checkout_mode === 'free' ? 0 : base.yearlyPrice,
        currency: month?.currency ?? null,
        checkout_mode,
      }
    }),
  )
}
