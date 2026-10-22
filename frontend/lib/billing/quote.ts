/**
 * Checkout preview (server): exactly what /api/billing/checkout would charge —
 * list price in the buyer's currency, coupon, account credit, GST split for
 * the buyer's billing profile and whether it renews automatically. Read-only:
 * nothing is reserved here.
 */
import 'server-only'
import { resolveBillingPlan } from '@/lib/billing-plans'
import type { PlanInterval } from '@/lib/billing-plan-mode'
import { userCouponRedemptions } from '@/lib/db/billing'
import { calculateDiscount, validateCoupon } from '@/lib/coupon-service'
import { couponEligibility } from './coupon-eligibility'
import { availableCredit } from './credits'
import { gstBreakdown, type TaxBreakdown } from './gst'
import { getBillingProfile } from './tax-invoice'
import { getBillingSettings } from './settings'

export interface CheckoutQuote {
  plan: { id: string; name: string; interval: PlanInterval | null; perks: string[] }
  currency: string
  list: number
  discount: number
  credit: number
  total: number
  tax: TaxBreakdown
  autoRenew: boolean
  coupon: { code: string; error: string | null; errorCode: string | null } | null
}

export type QuoteError = 'unknown_plan' | 'free_plan' | 'contact_sales'

export async function checkoutQuote(input: {
  userId: string
  planId: string
  interval: PlanInterval
  currency: 'INR' | 'USD'
  couponCode?: string | null
  hasPaidBefore: boolean
}): Promise<{ ok: true; quote: CheckoutQuote } | { ok: false; code: QuoteError }> {
  const plan = await resolveBillingPlan(input.planId, input.interval, input.currency)
  if (!plan) return { ok: false, code: 'unknown_plan' }
  if (plan.mode === 'free') return { ok: false, code: 'free_plan' }
  if (plan.mode === 'contact_sales') return { ok: false, code: 'contact_sales' }

  let afterCoupon = plan.amount_paise
  let coupon: CheckoutQuote['coupon'] = null
  if (input.couponCode) {
    const v = await validateCoupon(input.couponCode, { target: 'plans', currency: plan.currency })
    if (!v.valid || !v.coupon) coupon = { code: input.couponCode.toUpperCase(), error: v.error || 'Invalid coupon.', errorCode: 'coupon_invalid' }
    else {
      const verdict = couponEligibility(v.coupon, { planId: plan.id, userRedemptions: await userCouponRedemptions(v.coupon.id, input.userId), hasPaidBefore: input.hasPaidBefore })
      if (!verdict.ok) {
        const { COUPON_REFUSAL_MESSAGES } = await import('./coupon-eligibility')
        coupon = { code: v.coupon.code, error: COUPON_REFUSAL_MESSAGES[verdict.code], errorCode: verdict.code }
      } else {
        afterCoupon = calculateDiscount(plan.amount_paise, v.coupon, plan.currency)
        coupon = { code: v.coupon.code, error: null, errorCode: null }
      }
    }
  }
  const usedCoupon = !!coupon && !coupon.error
  const credit = afterCoupon > 0 && plan.kind !== 'one_time' ? Math.min(afterCoupon, await availableCredit(input.userId, plan.currency)) : 0
  const total = afterCoupon - credit
  const [settings, profile] = await Promise.all([getBillingSettings(), getBillingProfile(`user:${input.userId}`)])
  const tax = gstBreakdown({
    amount: total,
    currency: plan.currency,
    supplierState: settings.supplier.state_code,
    buyerGstin: profile?.gstin,
    buyerState: profile?.state_code,
    buyerCountry: profile?.country,
    rateBps: settings.gst_rate_bps,
  })
  // Same rule as checkout: list price, no credit, recurring plan → the gateway renews it.
  const autoRenew = plan.kind === 'subscription' && !usedCoupon && credit === 0 && (plan.currency !== 'INR' || settings.razorpay_autopay)
  return {
    ok: true,
    quote: {
      plan: { id: plan.id, name: plan.name, interval: plan.interval ?? null, perks: plan.perks },
      currency: plan.currency,
      list: plan.amount_paise,
      discount: plan.amount_paise - afterCoupon,
      credit,
      total,
      tax,
      autoRenew,
      coupon,
    },
  }
}
