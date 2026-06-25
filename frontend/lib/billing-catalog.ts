/** Shared plan catalog for checkout + UI (amounts in USD per month unless noted). */
export type BillingPlanId = 'free' | 'pro' | 'enterprise'

export type BillingInterval = 'month' | 'year'

export const BILLING_PLANS: Array<{
  id: BillingPlanId
  name: string
  description: string
  monthlyUsd: number
  /** ~15% off vs 12× monthly when billed yearly */
  yearlyUsd: number
  features: string[]
  popular?: boolean
}> = [
  {
    id: 'free',
    name: 'Free',
    description: 'Get started with CodeSpectra',
    monthlyUsd: 0,
    yearlyUsd: 0,
    features: [
      'Up to 5 code scans per month',
      'Basic analysis reports',
      'Community support',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'For professional developers',
    monthlyUsd: 29,
    yearlyUsd: Math.round(29 * 12 * 0.85),
    features: [
      'Unlimited code scans',
      'Advanced analytics',
      'Integration support',
      'Email support',
    ],
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large teams',
    monthlyUsd: 99,
    yearlyUsd: Math.round(99 * 12 * 0.85),
    features: [
      'Everything in Pro',
      'Team collaboration',
      'Dedicated support',
      'Custom integrations',
    ],
  },
]

export function findPlan(planId: string) {
  return BILLING_PLANS.find((p) => p.id === planId) ?? BILLING_PLANS[0]
}

export function chargeAmountCents(planId: string, interval: BillingInterval): number {
  const p = findPlan(planId)
  const usd = interval === 'year' ? p.yearlyUsd : p.monthlyUsd
  return Math.round(usd * 100)
}
