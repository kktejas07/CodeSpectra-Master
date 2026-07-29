import { billingCoupons, billingSubscriptions, type BillingCouponDoc } from '@/lib/db/billing'

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

export function calculateDiscount(amount_paise: number, coupon: BillingCouponDoc): number {
  if (coupon.discount_type === 'trial' || coupon.discount_type === 'percentage') {
    const discount = Math.floor(amount_paise * (coupon.discount_value / 100))
    return Math.max(0, amount_paise - discount)
  } else if (coupon.discount_type === 'flat') {
    const discountPaise = coupon.discount_value * 100
    return Math.max(0, amount_paise - discountPaise)
  }
  return amount_paise
}

export async function applyTrialToSubscription(userId: string, coupon: BillingCouponDoc): Promise<void> {
  if (coupon.discount_type !== 'trial' || !coupon.trial_duration_days) return
  const subs = await billingSubscriptions()
  const trialEnds = new Date(Date.now() + coupon.trial_duration_days * 86400000).toISOString()
  await subs.updateOne(
    { user_id: userId, status: 'active' },
    { $set: { trial_ends_at: trialEnds } }
  )
}

export async function expireTrials(): Promise<number> {
  const subs = await billingSubscriptions()
  const now = new Date().toISOString()
  const result = await subs.updateMany(
    { trial_ends_at: { $lte: now, $ne: null }, status: 'active' } as any,
    { $set: { status: 'expired', plan_id: 'free' } }
  )
  return result.modifiedCount
}
