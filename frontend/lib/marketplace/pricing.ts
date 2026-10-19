/**
 * Marketplace money math (buyer part) — pure, integer minor units only.
 *
 *  - subtotal  = Σ unit_price × qty
 *  - discount  = coupon amount, clamped to the subtotal, split pro-rata over the lines
 *                (largest remainder, so the parts always add up exactly)
 *  - shipping  = per seller: the highest fee among that seller's physical lines, waived when
 *                the seller's physical net reaches the lowest `free_over` among them
 *  - tax       = GST (INR) / sales tax (USD) at the settings rate on (net + shipping) per line.
 *                prices_include_tax → tax is the part already inside the price (not added);
 *                otherwise it is added on top.
 *  - commission (bps snapshot) is taken on the line's net excluding tax (`base`); the seller
 *    earns the rest, so base = commission_amount + seller_earnings = OrderLine.line_total, which
 *    is what lib/marketplace/ledger.ts credits. Tax stays with the platform (remitted centrally);
 *    shipping is credited by the ledger from Order.shipping_total.
 *
 * The server recomputes everything at checkout — client amounts are never trusted.
 */
import type { Currency, ItemKind, MarketplaceSettings } from './contract'

export interface PriceLineInput {
  key: string
  seller_id: string
  kind: ItemKind
  unit_price: number
  qty: number
  commission_bps: number
  shipping?: { fee: number; free_over?: number | null } | null
}

export interface PricedLine {
  key: string
  gross: number
  discount: number
  net: number
  shipping_amount: number
  tax: number
  /** net excluding tax = commission_amount + seller_earnings (OrderLine.line_total) */
  base: number
  commission_amount: number
  seller_earnings: number
}

export interface Quote {
  currency: Currency
  lines: PricedLine[]
  subtotal: number
  discount_total: number
  shipping_total: number
  tax_total: number
  grand_total: number
  tax_bps: number
  prices_include_tax: boolean
}

/** Smallest charge each gateway accepts (PhonePe ₹1, Stripe $0.50). 0 = free order, no gateway. */
export const MIN_CHARGE: Record<Currency, number> = { INR: 100, USD: 50 }

export function taxBpsFor(currency: Currency, s: Pick<MarketplaceSettings, 'tax'>): number {
  return currency === 'INR' ? s.tax.in_gst_bps : s.tax.us_sales_tax_bps
}

function assertMinor(n: number, what: string) {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${what} must be a non-negative integer (minor units)`)
}

/** Split `amount` over `weights` proportionally; parts are integers and sum to `amount` exactly. */
export function allocateProRata(amount: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0)
  if (amount <= 0 || total <= 0) return weights.map(() => 0)
  const raw = weights.map((w) => (amount * w) / total)
  const parts = raw.map((r) => Math.floor(r))
  let left = amount - parts.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (let k = 0; left > 0 && k < order.length; k++, left--) parts[order[k].i] += 1
  return parts
}

/** Tax on `amount` at `bps`: the included part (inclusive prices) or the added part. Rounded half-up. */
export function taxOn(amount: number, bps: number, inclusive: boolean): number {
  if (amount <= 0 || bps <= 0) return 0
  return inclusive ? Math.round((amount * bps) / (10_000 + bps)) : Math.round((amount * bps) / 10_000)
}

/** Discount for a coupon (same semantics as lib/coupon-service calculateDiscount), clamped. */
export function couponDiscount(subtotal: number, coupon: { discount_type: string; discount_value: number } | null | undefined): number {
  if (!coupon) return 0
  const value = Number(coupon.discount_value)
  if (!Number.isFinite(value) || value <= 0) return 0
  if (coupon.discount_type === 'percentage') return Math.min(subtotal, Math.floor(subtotal * (Math.min(100, value) / 100)))
  if (coupon.discount_type === 'flat') return Math.min(subtotal, Math.round(value * 100))
  return 0 // 'trial' coupons are plan-only
}

export function computeQuote(
  lines: PriceLineInput[],
  opts: { currency: Currency; settings: Pick<MarketplaceSettings, 'tax'>; discount?: number },
): Quote {
  const taxBps = taxBpsFor(opts.currency, opts.settings)
  const inclusive = !!opts.settings.tax.prices_include_tax
  const gross = lines.map((l) => {
    assertMinor(l.unit_price, 'unit_price')
    if (!Number.isSafeInteger(l.qty) || l.qty < 1) throw new Error('qty must be a positive integer')
    return l.unit_price * l.qty
  })
  const subtotal = gross.reduce((a, b) => a + b, 0)
  const discountTotal = Math.max(0, Math.min(subtotal, Math.floor(opts.discount ?? 0)))
  const discounts = allocateProRata(discountTotal, gross)
  const net = gross.map((g, i) => g - discounts[i])

  // Shipping per seller group of physical lines.
  const shipping = lines.map(() => 0)
  const groups = new Map<string, number[]>()
  lines.forEach((l, i) => {
    if (l.kind !== 'physical' || !l.shipping) return
    groups.set(l.seller_id, [...(groups.get(l.seller_id) || []), i])
  })
  for (const idx of groups.values()) {
    let carrier = idx[0]
    for (const i of idx) if ((lines[i].shipping?.fee ?? 0) > (lines[carrier].shipping?.fee ?? 0)) carrier = i
    const fee = Math.max(0, lines[carrier].shipping?.fee ?? 0)
    assertMinor(fee, 'shipping fee')
    const freeOvers = idx.map((i) => lines[i].shipping?.free_over).filter((v): v is number => typeof v === 'number' && v >= 0)
    const groupNet = idx.reduce((a, i) => a + net[i], 0)
    const free = freeOvers.length > 0 && groupNet >= Math.min(...freeOvers)
    shipping[carrier] = free ? 0 : fee
  }

  const priced: PricedLine[] = lines.map((l, i) => {
    const itemTax = taxOn(net[i], taxBps, inclusive)
    const shipTax = taxOn(shipping[i], taxBps, inclusive)
    const base = inclusive ? net[i] - itemTax : net[i]
    const bps = Math.max(0, Math.min(10_000, Math.round(l.commission_bps)))
    const commission = Math.round((base * bps) / 10_000)
    return {
      key: l.key,
      gross: gross[i],
      discount: discounts[i],
      net: net[i],
      shipping_amount: inclusive ? shipping[i] - shipTax : shipping[i],
      tax: itemTax + shipTax,
      base,
      commission_amount: commission,
      seller_earnings: base - commission,
    }
  })
  const shippingTotal = shipping.reduce((a, b) => a + b, 0)
  const taxTotal = priced.reduce((a, p) => a + p.tax, 0)
  const grand = subtotal - discountTotal + shippingTotal + (inclusive ? 0 : taxTotal)
  return {
    currency: opts.currency,
    lines: priced,
    subtotal,
    discount_total: discountTotal,
    shipping_total: shippingTotal,
    tax_total: taxTotal,
    grand_total: grand,
    tax_bps: taxBps,
    prices_include_tax: inclusive,
  }
}

/** Is this amount payable through a gateway (0 = free order, settled without one)? */
export function chargeable(amount: number, currency: Currency): 'free' | 'ok' | 'too_small' {
  if (amount === 0) return 'free'
  return amount >= MIN_CHARGE[currency] ? 'ok' : 'too_small'
}

/** One currency per cart: adding an item in another currency needs an explicit switch. */
export function currencyDecision(cart: { currency: Currency; lines: unknown[] }, productCurrency: Currency): 'ok' | 'switch_required' | 'adopt' {
  if (cart.currency === productCurrency) return 'ok'
  return cart.lines.length === 0 ? 'adopt' : 'switch_required'
}

export function formatMinor(amount: number, currency: Currency): string {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount / 100)
  } catch {
    return `${currency} ${(amount / 100).toFixed(2)}`
  }
}

/**
 * What the buyer paid for one order line: base (net ex-tax) + its shipping (ex-tax) + its tax.
 * Holds for both tax modes, and the lines add up to the order's grand total.
 */
export function linePaid(l: { line_total: number; shipping_amount?: number; tax?: number }): number {
  return l.line_total + (l.shipping_amount ?? 0) + (l.tax ?? 0)
}
