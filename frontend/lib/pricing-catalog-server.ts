import 'server-only'
import { getMongoDb } from '@/lib/mongodb'
import { BILLING_PLANS, type BillingPlanId } from '@/lib/billing-catalog'
import { type MergedBillingPlan } from '@/lib/pricing-catalog'

export async function getMergedBillingPlans(): Promise<MergedBillingPlan[]> {
  try {
    const db = await getMongoDb()
    const dbPlans = await db.collection('plans').find({}).toArray()
    if (dbPlans && dbPlans.length > 0) {
      return dbPlans.map((p: any) => {
        const id = p.plan || p.id || p._id?.toString() || 'free'
        const name = p.name || id
        const description = p.description || ''
        let monthlyUsd = 0
        if (typeof p.price === 'number') monthlyUsd = p.price
        else if (typeof p.price === 'string') {
          const m = p.price.match(/[\d.]+/)
          if (m) monthlyUsd = parseFloat(m[0])
        }
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
