/**
 * Coupon rules — pure, shared by plan checkout, marketplace checkout, the
 * admin coupon API and the seller coupon API (audits CORE-018 / CORE-021).
 *
 * Currency (CORE-018)
 *  - A flat ("fixed amount") coupon is worth `discount_value` in ITS currency
 *    and only applies to orders in that currency. Coupons created before
 *    coupons had a currency are treated as INR (and migrated to INR, with a
 *    notice on the admin Coupons page).
 *  - Percentage and trial coupons are currency-agnostic.
 *
 * Scope + funding (CORE-021)
 *  - applies_to: 'all' (default) | 'plans' | 'marketplace'.
 *  - A seller coupon (seller_id set) is created by that seller, applies only
 *    to that seller's items, and the seller pays for it (their earnings drop).
 *  - A platform coupon (no seller_id) on the marketplace discounts:
 *      · the platform's own items;
 *      · items of sellers who opted in to platform promotions — seller-funded;
 *      · other sellers' items only when marketplace_funding = 'platform_funded'
 *        — then the platform pays: commission and the seller's earnings are
 *        computed on the undiscounted price and the ledger books the discount
 *        against the platform.
 *    Otherwise third-party items are not discounted at all.
 */

export type CouponCurrency = 'INR' | 'USD'
export type CouponTarget = 'plans' | 'marketplace'
export type CouponAppliesTo = 'all' | CouponTarget
export type MarketplaceFunding = 'platform_items_only' | 'platform_funded'

export const COUPON_CURRENCIES: readonly CouponCurrency[] = ['INR', 'USD']
/** Coupons saved before currency existed were created in the (then INR-only) platform currency. */
export const LEGACY_COUPON_CURRENCY: CouponCurrency = 'INR'

export interface CouponRuleFields {
  discount_type: string
  discount_value: number
  currency?: string | null
  applies_to?: string | null
  marketplace_funding?: string | null
  seller_id?: string | null
}

export function isCouponCurrency(v: unknown): v is CouponCurrency {
  return v === 'INR' || v === 'USD'
}

/** Currency of a flat coupon (legacy → INR). Null for percentage/trial (any currency). */
export function couponCurrency(c: Pick<CouponRuleFields, 'discount_type' | 'currency'>): CouponCurrency | null {
  if (c.discount_type !== 'flat') return null
  return isCouponCurrency(c.currency) ? c.currency : LEGACY_COUPON_CURRENCY
}

export function couponAppliesTo(c: Pick<CouponRuleFields, 'applies_to' | 'seller_id'>): CouponAppliesTo {
  if (c.seller_id) return 'marketplace'
  return c.applies_to === 'plans' || c.applies_to === 'marketplace' ? c.applies_to : 'all'
}

const money = (minor: number, cur: CouponCurrency) => `${cur === 'INR' ? '₹' : '$'}${(minor / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`

/** Can this coupon be used for an order of `target` in `currency`? */
export function couponUsableFor(
  c: CouponRuleFields,
  target: CouponTarget,
  currencyIn: string,
): { ok: true } | { ok: false; error: string } {
  const currency = String(currencyIn || '').toUpperCase()
  const scope = couponAppliesTo(c)
  if (scope !== 'all' && scope !== target) {
    return { ok: false, error: scope === 'plans' ? 'This coupon is for plans only.' : 'This coupon is for marketplace items only.' }
  }
  if (target === 'marketplace' && c.discount_type === 'trial') return { ok: false, error: 'This coupon is for plans only.' }
  const cur = couponCurrency(c)
  if (cur && cur !== currency) {
    return { ok: false, error: `This coupon takes ${money(Math.round(Number(c.discount_value) * 100), cur)} off ${cur} orders, so it can't be used on a ${currency} order.` }
  }
  return { ok: true }
}

/** Amount off (minor units) for `amount` in `currency`; never more than the amount. 0 when not usable. */
export function couponAmountOff(amount: number, c: CouponRuleFields, currency: string): number {
  const value = Number(c.discount_value)
  if (!Number.isFinite(value) || value <= 0 || amount <= 0) return 0
  if (c.discount_type === 'percentage' || c.discount_type === 'trial') {
    return Math.min(amount, Math.floor(amount * (Math.min(100, value) / 100)))
  }
  if (c.discount_type === 'flat') {
    if (couponCurrency(c) !== String(currency || '').toUpperCase()) return 0
    return Math.min(amount, Math.round(value * 100))
  }
  return 0
}

export interface CouponLine {
  seller_id: string
  /** The seller is the platform's own store. */
  is_platform: boolean
  /** The seller opted in to platform-wide promotions (and pays for them). */
  accepts_platform_coupons?: boolean
  gross: number
}

export interface MarketplaceCouponPlan {
  /** Total discount (minor units), split over eligible lines by the pricing step. */
  amount: number
  eligible: boolean[]
  /** Per line: the platform pays this line's share (seller earnings unaffected). */
  platformFunded: boolean[]
  error: string | null
}

/** Which cart lines a coupon discounts, who pays, and how much in total. Pure. */
export function planMarketplaceCoupon(lines: CouponLine[], c: CouponRuleFields, currency: string): MarketplaceCouponPlan {
  const none = (error: string | null): MarketplaceCouponPlan => ({ amount: 0, eligible: lines.map(() => false), platformFunded: lines.map(() => false), error })
  const usable = couponUsableFor(c, 'marketplace', currency)
  if (!usable.ok) return none(usable.error)
  const eligible: boolean[] = []
  const platformFunded: boolean[] = []
  for (const l of lines) {
    if (c.seller_id) {
      eligible.push(l.seller_id === c.seller_id)
      platformFunded.push(false)
    } else if (l.is_platform) {
      eligible.push(true)
      platformFunded.push(false) // the platform's own store: no seller to protect
    } else if (l.accepts_platform_coupons) {
      eligible.push(true)
      platformFunded.push(false)
    } else if (c.marketplace_funding === 'platform_funded') {
      eligible.push(true)
      platformFunded.push(true)
    } else {
      eligible.push(false)
      platformFunded.push(false)
    }
  }
  const base = lines.reduce((a, l, i) => a + (eligible[i] ? l.gross : 0), 0)
  if (base === 0) {
    return none(c.seller_id ? "This coupon is for another seller's items." : "This coupon doesn't apply to the items in your cart.")
  }
  return { amount: couponAmountOff(base, c, currency), eligible, platformFunded, error: null }
}
