/**
 * CORE-018 (coupon currency) and CORE-021 (marketplace coupon scope + funding).
 */
import { describe, it, expect } from 'vitest'
import { couponAmountOff, couponCurrency, couponUsableFor, planMarketplaceCoupon } from '@/lib/billing/coupon-rules'
import { calculateDiscount } from '@/lib/coupon-service'
import { computeQuote } from '@/lib/marketplace/pricing'
import { buildRefundEntries, buildSaleEntries, lineCommission } from '@/lib/marketplace/ledger'
import { validateCouponInput } from '@/lib/billing-lifecycle'
import type { Order, OrderLine } from '@/lib/marketplace/contract'

const flatInr = { discount_type: 'flat', discount_value: 500, currency: 'INR' }
const legacyFlat = { discount_type: 'flat', discount_value: 500 }
const pct = { discount_type: 'percentage', discount_value: 20 }

describe('coupon currency (CORE-018)', () => {
  it('a ₹500 coupon takes nothing off a dollar order and is refused', () => {
    expect(couponAmountOff(100_00, flatInr, 'USD')).toBe(0)
    expect(calculateDiscount(100_00, flatInr as never, 'USD')).toBe(100_00)
    const r = couponUsableFor(flatInr, 'plans', 'USD')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/INR orders/)
  })
  it('applies in its own currency, clamped', () => {
    expect(couponAmountOff(1000_00, flatInr, 'INR')).toBe(500_00)
    expect(couponAmountOff(300_00, flatInr, 'inr')).toBe(300_00)
    expect(couponUsableFor(flatInr, 'plans', 'INR').ok).toBe(true)
  })
  it('legacy flat coupons without a currency count as INR', () => {
    expect(couponCurrency(legacyFlat)).toBe('INR')
    expect(couponAmountOff(1000_00, legacyFlat, 'USD')).toBe(0)
  })
  it('percentage coupons work in any currency', () => {
    expect(couponCurrency(pct)).toBeNull()
    expect(couponAmountOff(100_00, pct, 'USD')).toBe(20_00)
    expect(couponUsableFor(pct, 'plans', 'USD').ok).toBe(true)
  })
  it('admins must pick a currency for a new fixed-amount coupon', () => {
    expect(validateCouponInput({ code: 'FLAT5', discount_type: 'flat', discount_value: 5 }, false).ok).toBe(false)
    const ok = validateCouponInput({ code: 'FLAT5', discount_type: 'flat', discount_value: 5, currency: 'USD' }, false)
    expect(ok.ok && ok.value.currency).toBe('USD')
    expect(validateCouponInput({ code: 'FLAT5', discount_type: 'flat', discount_value: 5, currency: 'EUR' }, false).ok).toBe(false)
  })
})

describe('coupon scope', () => {
  it('seller coupons and marketplace-only coupons never apply to plans', () => {
    expect(couponUsableFor({ ...pct, seller_id: 's1' }, 'plans', 'INR').ok).toBe(false)
    expect(couponUsableFor({ ...pct, applies_to: 'marketplace' }, 'plans', 'INR').ok).toBe(false)
    expect(couponUsableFor({ ...pct, applies_to: 'plans' }, 'marketplace', 'INR').ok).toBe(false)
    expect(couponUsableFor({ discount_type: 'trial', discount_value: 100 }, 'marketplace', 'INR').ok).toBe(false)
  })
})

const lines = [
  { seller_id: 'platform', is_platform: true, gross: 1000_00 },
  { seller_id: 's1', is_platform: false, gross: 1000_00 },
  { seller_id: 's2', is_platform: false, accepts_platform_coupons: true, gross: 1000_00 },
]

describe('marketplace coupon eligibility + funding (CORE-021)', () => {
  it('a platform coupon skips third-party items unless the seller opted in', () => {
    const p = planMarketplaceCoupon(lines, { ...pct }, 'INR')
    expect(p.eligible).toEqual([true, false, true])
    expect(p.platformFunded).toEqual([false, false, false])
    expect(p.amount).toBe(400_00) // 20% of the two eligible lines
  })
  it('a platform-funded coupon covers everyone; the platform pays for non-opted-in sellers', () => {
    const p = planMarketplaceCoupon(lines, { ...pct, marketplace_funding: 'platform_funded' }, 'INR')
    expect(p.eligible).toEqual([true, true, true])
    expect(p.platformFunded).toEqual([false, true, false])
  })
  it("a seller coupon only discounts that seller's items", () => {
    const p = planMarketplaceCoupon(lines, { ...pct, seller_id: 's1' }, 'INR')
    expect(p.eligible).toEqual([false, true, false])
    expect(planMarketplaceCoupon([lines[0]], { ...pct, seller_id: 's1' }, 'INR').error).toMatch(/another seller/)
  })
  it('a flat coupon in the wrong currency is refused', () => {
    expect(planMarketplaceCoupon(lines, flatInr, 'USD').error).toMatch(/INR/)
  })

  it('platform-funded discount leaves seller earnings untouched; seller-funded lowers them', () => {
    const settings = { tax: { in_gst_bps: 0, us_sales_tax_bps: 0, prices_include_tax: false } }
    const inputs = [
      { key: 'a', seller_id: 's1', kind: 'digital' as const, unit_price: 1000_00, qty: 1, commission_bps: 1000 },
      { key: 'b', seller_id: 's2', kind: 'digital' as const, unit_price: 1000_00, qty: 1, commission_bps: 1000 },
    ]
    const q = computeQuote(inputs, { currency: 'INR', settings, coupon: { amount: 400_00, eligible: [true, true], platformFunded: [true, false] } })
    const [a, b] = q.lines
    expect(q.discount_total).toBe(400_00)
    expect(q.grand_total).toBe(1600_00)
    expect(a.base).toBe(800_00)
    expect(a.platform_funded).toBe(200_00)
    expect(a.commission_amount).toBe(100_00) // on the undiscounted 1000
    expect(a.seller_earnings).toBe(900_00) // as if there were no coupon
    expect(b.platform_funded).toBe(0)
    expect(b.seller_earnings).toBe(720_00) // seller-funded: 800 − 10%
    expect(a.commission_amount + a.seller_earnings).toBe(a.base + a.platform_funded)
  })

  it('the ledger records the platform as payer, and a full refund reverses it', () => {
    const l: OrderLine = {
      id: 'l1', product_id: 'p1', seller_id: 's1', kind: 'digital', title: 'Book', qty: 1, unit_price: 1000_00,
      line_total: 800_00, platform_funded: 200_00, commission_bps: 1000, commission_amount: 100_00, seller_earnings: 900_00,
      fulfilment: { status: 'delivered_digital' },
    }
    const o: Order = {
      id: 'o1', number: 'CS-1', buyer_id: 'b', buyer_email: 'b@example.com', currency: 'INR', lines: [l], subtotal: 1000_00,
      shipping_total: 0, tax_total: 0, discount_total: 200_00, grand_total: 800_00,
      payment: { gateway: 'phonepe', status: 'succeeded', paid_at: '2026-10-01T00:00:00Z' }, status: 'paid', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
    }
    expect(lineCommission(l)).toBe(100_00)
    const sale = buildSaleEntries(o, { hold_days: { digital: 7, physical: 14, service: 3 } })
    const seller = sale.filter((e) => e.seller_id === 's1').reduce((a, e) => a + e.amount, 0)
    const platform = sale.filter((e) => e.seller_id === null).reduce((a, e) => a + e.amount, 0)
    expect(seller).toBe(900_00)
    expect(platform).toBe(100_00 - 200_00) // commission minus the coupon it funded
    expect(seller + platform).toBe(o.grand_total) // money in = money booked

    const refund = buildRefundEntries(o, ['l1'], 800_00, { lines: {}, shipping: {}, shippingPaid: {} }, 'r1')
    const all = [...sale, ...refund]
    expect(all.filter((e) => e.seller_id === 's1').reduce((a, e) => a + e.amount, 0)).toBe(0)
    expect(all.filter((e) => e.seller_id === null).reduce((a, e) => a + e.amount, 0)).toBe(0)
  })
})
