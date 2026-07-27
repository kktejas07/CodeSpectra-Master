import { billingCoupons } from '@/lib/db/billing'
import type { BillingCouponDoc } from '@/lib/db/billing'

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
  if (coupon.discount_type === 'percentage') {
    const discount = Math.floor(amount_paise * (coupon.discount_value / 100))
    return Math.max(0, amount_paise - discount)
  } else if (coupon.discount_type === 'flat') {
    // discount_value is in base currency units (e.g. INR 100). Convert to paise.
    const discountPaise = coupon.discount_value * 100
    return Math.max(0, amount_paise - discountPaise)
  }
  return amount_paise
}
