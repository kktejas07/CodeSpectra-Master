import { billingCoupons, billingSubscriptions, type BillingCouponDoc } from '@/lib/db/billing'
import { shouldExpireTrial } from '@/lib/billing-lifecycle'
import { couponAmountOff, couponCurrency, couponUsableFor, type CouponTarget } from '@/lib/billing/coupon-rules'

/**
 * Look up an active coupon by code. With `ctx`, also checks it can be used
 * for that kind of order in that currency (CORE-018: a flat coupon only
 * applies in its own currency; seller coupons are marketplace-only).
 */
export async function validateCoupon(
  code: string,
  ctx?: { target: CouponTarget; currency?: string },
): Promise<{ valid: boolean; coupon?: BillingCouponDoc; error?: string }> {
  const coupons = await billingCoupons()
  const coupon = await coupons.findOne({ code: code.toUpperCase(), active: true })

  if (!coupon) {
    return { valid: false, error: 'Invalid or inactive coupon code.' }
  }

  if (coupon.max_uses > 0 && coupon.current_uses >= coupon.max_uses) {
    return { valid: false, error: 'Coupon usage limit reached.' }
  }

  if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) {
    return { valid: false, error: 'Coupon has expired.' }
  }

  if (ctx) {
    // Without a currency (order not priced yet) only the scope is checked here.
    const usable = couponUsableFor(coupon, ctx.target, ctx.currency ?? couponCurrency(coupon) ?? 'INR')
    if (!usable.ok) return { valid: false, error: usable.error }
  }

  return { valid: true, coupon }
}

/**
 * Price after the coupon, in minor units, for an order in `currency`.
 * Clamped (never raises the price). A flat coupon in another currency takes
 * nothing off — callers refuse it first with couponUsableFor.
 */
export function calculateDiscount(
  amount_paise: number,
  coupon: Pick<BillingCouponDoc, 'discount_type' | 'discount_value' | 'currency'>,
  currency: string,
): number {
  return Math.max(0, amount_paise - couponAmountOff(amount_paise, coupon, currency))
}

/**
 * Daily job: end subscriptions whose current period was a trial that has run
 * out. Never touches a period funded by a later paid order (D5).
 */
export async function expireTrials(): Promise<number> {
  const subs = await billingSubscriptions()
  const now = new Date()
  const candidates = await subs
    .find({ status: 'active', trial_ends_at: { $lte: now.toISOString() } } as never, {
      projection: { _id: 0, id: 1, status: 1, ends_at: 1, trial_ends_at: 1, trial_order_id: 1, last_order_id: 1 },
    })
    .limit(500)
    .toArray()
  let n = 0
  for (const sub of candidates) {
    if (!shouldExpireTrial(sub, now)) continue
    const r = await subs.updateOne(
      { id: sub.id, status: 'active', last_order_id: sub.trial_order_id },
      { $set: { status: 'expired', ends_at: sub.trial_ends_at!, updated_at: now.toISOString() } },
    )
    n += r.modifiedCount
  }
  return n
}
