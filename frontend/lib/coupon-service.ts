import { billingCoupons, billingSubscriptions, type BillingCouponDoc } from '@/lib/db/billing'
import { shouldExpireTrial } from '@/lib/billing-lifecycle'

export async function validateCoupon(code: string): Promise<{ valid: boolean; coupon?: BillingCouponDoc; error?: string }> {
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

  return { valid: true, coupon }
}

/** Price after the coupon, in minor units. Values are clamped (never raises the price). */
export function calculateDiscount(amount_paise: number, coupon: Pick<BillingCouponDoc, 'discount_type' | 'discount_value'>): number {
  const value = Number(coupon.discount_value)
  if (!Number.isFinite(value) || value <= 0) return amount_paise
  if (coupon.discount_type === 'trial' || coupon.discount_type === 'percentage') {
    const pct = Math.min(100, value)
    const discount = Math.floor(amount_paise * (pct / 100))
    return Math.max(0, amount_paise - discount)
  } else if (coupon.discount_type === 'flat') {
    return Math.max(0, amount_paise - Math.round(value * 100))
  }
  return amount_paise
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
