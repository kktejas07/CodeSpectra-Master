/**
 * Checkout (buyer part): validate the cart on the server, price it (pricing.ts), reserve
 * stock and service slots, reserve the coupon, store an Order in `pending_payment` with
 * snapshot prices + commission per line, then hand the buyer to the gateway.
 * Unpaid orders release their reservations after RESERVATION_MS (settle.ts sweep).
 */
import 'server-only'
import { getMongoDb } from '@/lib/mongodb'
import { validateCoupon } from '@/lib/coupon-service'
import { releaseCouponReservation, reserveCouponUse } from '@/lib/db/billing'
import type { Currency } from './contract'
import { newId, nowIso } from './db'
import { CartError, findCart, priceInputs, resolveLines } from './cart'
import { getSettings } from './settings'
import { chargeable, computeQuote, type Quote, type QuoteCoupon } from './pricing'
import { planMarketplaceCoupon } from '@/lib/billing/coupon-rules'
import { reserveAll, releaseAll, type StockItem } from './stock'
import { holdSlot, releaseBookings } from './booking'
import { orders, RESERVATION_MS, type OrderDoc, type OrderLineDoc } from './order-doc'
import { pickGateway, startPayment } from './gateways'

export interface Address { name: string; line1: string; line2?: string; city: string; state: string; postal_code: string; country: string; phone: string }

export interface CheckoutInput { coupon?: string | null; contact_phone: string; address?: Address | null; buyer_timezone?: string | null }

const PHONE = /^\+?[0-9][0-9\s-]{6,18}[0-9]$/

export function parseCheckoutInput(raw: unknown): { ok: true; value: CheckoutInput } | { ok: false; error: string } {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const phone = s(b.contact_phone, 24)
  if (!PHONE.test(phone)) return { ok: false, error: 'Enter a valid contact phone number.' }
  const coupon = s(b.coupon, 40).toUpperCase()
  if (coupon && !/^[A-Z0-9_-]{2,40}$/.test(coupon)) return { ok: false, error: 'That coupon code is not valid.' }
  let address: Address | null = null
  if (b.address && typeof b.address === 'object') {
    const a = b.address as Record<string, unknown>
    address = { name: s(a.name, 100), line1: s(a.line1, 200), line2: s(a.line2, 200) || undefined, city: s(a.city, 80), state: s(a.state, 80), postal_code: s(a.postal_code, 12), country: s(a.country, 10).toUpperCase(), phone: s(a.phone, 24) || phone }
    if (!address.name || !address.line1 || !address.city || !address.state) return { ok: false, error: 'Fill in the delivery address.' }
    if (!/^[A-Z]{2}$/.test(address.country)) return { ok: false, error: 'Choose the delivery country.' }
    if (!/^[A-Za-z0-9 -]{3,12}$/.test(address.postal_code)) return { ok: false, error: 'Enter a valid postal code.' }
    if (!PHONE.test(address.phone)) return { ok: false, error: 'Enter a valid phone number for delivery.' }
  }
  const tz = s(b.buyer_timezone, 64)
  return { ok: true, value: { coupon: coupon || null, contact_phone: phone, address, buyer_timezone: /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(tz) ? tz : null } }
}

/** Shipping region check: [] / ['*'] / ['ALL'] = everywhere. */
export function shipsTo(regions: string[] | undefined, country: string): boolean {
  if (!regions?.length) return true
  const r = regions.map((x) => x.toUpperCase())
  return r.includes('*') || r.includes('ALL') || r.includes(country.toUpperCase())
}

async function nextOrderNumber(): Promise<string> {
  const year = new Date().getUTCFullYear()
  const col = (await getMongoDb()).collection<{ _id: string; seq: number }>('mkt_counters')
  const r = await col.findOneAndUpdate({ _id: `order-${year}` }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' }).catch(() => null)
  const seq = (r as { seq?: number } | null)?.seq ?? (Date.now() % 1_000_000)
  return `CS-${year}-${String(seq).padStart(6, '0')}`
}

interface Priced { quote: Quote; inputs: ReturnType<typeof priceInputs>; resolved: Awaited<ReturnType<typeof resolveLines>>; currency: Currency; coupon: { id: string; code: string; funded_by?: 'platform' | 'seller'; seller_id?: string | null } | null; couponError: string | null }

/** Server-side quote for the signed-in buyer's cart (+ optional coupon). Throws CartError. */
export async function priceCart(userId: string, couponCode?: string | null): Promise<Priced> {
  const cart = await findCart({ userId, anonId: null })
  if (!cart || !cart.lines.length) throw new CartError(400, 'Your cart is empty.')
  const resolved = await resolveLines(cart.lines, cart.currency)
  const bad = resolved.find((r) => !r.product || r.view.issues.length)
  if (bad) throw new CartError(409, 'Some items in your cart changed. Review your cart before paying.', 'cart_changed')
  const settings = await getSettings()
  const inputs = priceInputs(resolved, settings)
  const base = computeQuote(inputs, { currency: cart.currency, settings })
  let coupon: Priced['coupon'] = null
  let couponError: string | null = null
  let split: QuoteCoupon | null = null
  if (couponCode) {
    const v = await validateCoupon(couponCode, { target: 'marketplace', currency: cart.currency })
    if (!v.valid || !v.coupon) couponError = v.error || 'Invalid coupon.'
    else {
      // CORE-021: platform coupons only touch platform items, opted-in sellers' items
      // (seller-funded) or — when the coupon is platform-funded — everyone's, with the
      // platform paying; seller coupons only their own items.
      const plan = planMarketplaceCoupon(
        resolved.map((r, i) => ({
          seller_id: r.product.seller_id,
          is_platform: !!r.seller?.is_platform,
          accepts_platform_coupons: !!(r.seller as { accepts_platform_coupons?: boolean } | null)?.accepts_platform_coupons,
          gross: inputs[i].unit_price * inputs[i].qty,
        })),
        v.coupon,
        cart.currency,
      )
      if (plan.error) couponError = plan.error
      else if (plan.amount > 0) {
        split = { amount: plan.amount, eligible: plan.eligible, platformFunded: plan.platformFunded }
        coupon = { id: v.coupon.id, code: v.coupon.code, funded_by: v.coupon.seller_id ? 'seller' : plan.platformFunded.some(Boolean) ? 'platform' : 'seller', seller_id: v.coupon.seller_id ?? null }
      }
    }
  }
  const quote = split ? computeQuote(inputs, { currency: cart.currency, settings, coupon: split }) : base
  return { quote, inputs, resolved, currency: cart.currency, coupon, couponError }
}

export interface CheckoutResult { order_id: string; number: string; redirect_url: string }

export async function createCheckout(user: { id: string; email: string }, input: CheckoutInput): Promise<CheckoutResult> {
  // A buyer has at most one open checkout: release older unpaid ones (their slots/stock).
  const { abandonOrder } = await import('./settle')
  const stale = await (await orders()).find({ buyer_id: user.id, status: 'pending_payment' }, { projection: { _id: 0, id: 1 } }).limit(5).toArray()
  for (const o of stale) await abandonOrder(o.id, 'replaced')

  const priced = await priceCart(user.id, input.coupon)
  if (input.coupon && priced.couponError) throw new CartError(400, priced.couponError, 'coupon')
  const { quote, inputs, resolved, currency, coupon } = priced

  const physical = resolved.filter((r) => r.product.kind === 'physical')
  if (physical.length) {
    if (!input.address) throw new CartError(400, 'Add a delivery address for the physical items.', 'address')
    const blocked = physical.find((r) => !shipsTo(r.product.shipping?.regions, input.address!.country))
    if (blocked) throw new CartError(400, `${blocked.product.title} does not ship to that country.`, 'address', { title: blocked.product.title })
  }

  const pay = chargeable(quote.grand_total, currency)
  if (pay === 'too_small') throw new CartError(400, 'The order total is below the minimum card payment.')
  const gateway = pay === 'free' ? (currency === 'INR' ? 'phonepe' : 'stripe') : await pickGateway(currency)
  if (!gateway) throw new CartError(503, `Payments in ${currency} are not available right now. Please try again later.`, 'checkout_gateway_unavailable', { currency })

  const now = nowIso()
  const orderId = newId()
  const priceByKey = new Map(quote.lines.map((p) => [p.key, p]))
  const lines: OrderLineDoc[] = resolved.map((r, i) => {
    const p = priceByKey.get(r.view.key)!
    const prod = r.product
    return {
      id: newId(),
      product_id: prod.id,
      seller_id: prod.seller_id,
      kind: prod.kind,
      title: prod.title,
      slug: prod.slug,
      image: prod.images?.[0] ?? null,
      variant_id: r.line.variant_id ?? null,
      variant_name: r.view.variant_name,
      qty: r.view.qty,
      unit_price: r.unit_price,
      gross: p.gross,
      discount: p.discount,
      tax: p.tax,
      shipping_amount: p.shipping_amount,
      line_total: p.base,
      ...(p.platform_funded > 0 ? { platform_funded: p.platform_funded } : {}),
      commission_bps: inputs[i].commission_bps,
      commission_amount: p.commission_amount,
      seller_earnings: p.seller_earnings,
      service: prod.kind === 'service' && prod.service ? { duration_min: prod.service.duration_min, mode: prod.service.mode, provider: prod.service.provider ?? 'manual', timezone: prod.service.timezone } : null,
      digital: prod.kind === 'digital' && prod.digital ? { file_ids: prod.digital.file_ids || [], download_limit: prod.digital.download_limit || 0, license_note: prod.digital.license_note } : null,
      fulfilment: { status: 'unfulfilled', booking: r.line.service_slot ? { start: r.line.service_slot, end: new Date(Date.parse(r.line.service_slot) + (prod.service?.duration_min || 0) * 60_000).toISOString() } : null, downloads_used: 0 },
    }
  })

  const order: OrderDoc = {
    id: orderId,
    number: await nextOrderNumber(),
    buyer_id: user.id,
    buyer_email: user.email,
    currency,
    lines,
    subtotal: quote.subtotal,
    shipping_total: quote.shipping_total,
    tax_total: quote.tax_total,
    discount_total: quote.discount_total,
    grand_total: quote.grand_total,
    tax_bps: quote.tax_bps,
    prices_include_tax: quote.prices_include_tax,
    shipping_address: physical.length ? input.address! : null,
    contact_phone: input.contact_phone,
    coupon,
    payment: { gateway, status: 'pending' },
    status: 'pending_payment',
    reservation: { status: 'held', expires_at: new Date(Date.now() + RESERVATION_MS).toISOString(), items: [] },
    created_at: now,
    updated_at: now,
    buyer_tz: input.buyer_timezone ?? null,
  }
  const col = await orders()
  await col.insertOne(order)

  const fail = async (status: number, msg: string, code: string, taken: StockItem[] = []): Promise<never> => {
    await releaseAll(taken)
    await releaseBookings(orderId)
    if (coupon) await releaseCouponReservation(coupon.id, user.id, orderId).catch((e) => console.error('[marketplace] coupon release failed', (e as Error)?.message))
    await col.updateOne({ id: orderId }, { $set: { status: 'cancelled', 'payment.status': 'failed', 'payment.failure': code, 'reservation.status': 'released', cancelled_reason: code, updated_at: nowIso() } })
    throw new CartError(status, msg, code)
  }

  // 1) stock (atomic per item, all-or-nothing)
  const want: StockItem[] = lines.filter((l) => l.kind === 'physical').map((l) => ({ product_id: l.product_id, variant_id: l.variant_id ?? null, qty: l.qty }))
  const { short, taken } = await reserveAll(want)
  if (short) {
    const title = lines.find((l) => l.product_id === short.product_id)?.title ?? 'An item'
    await fail(409, `${title} just sold out or has fewer units left. Update your cart and try again.`, 'out_of_stock')
  }
  // 2) service slots
  for (const l of lines.filter((x) => x.kind === 'service')) {
    const r = resolved.find((x) => x.product.id === l.product_id && x.line.service_slot === l.fulfilment.booking?.start)
    const ok = r ? await holdSlot({ product: r.product, startIso: l.fulfilment.booking!.start, orderId, lineId: l.id, buyerId: user.id }) : false
    if (!ok) await fail(409, `The time you picked for ${l.title} was just taken. Pick another slot.`, 'slot_unavailable', taken)
  }
  // 3) coupon (one use per buyer, counted now, bound to THIS order; released if it isn't paid)
  if (coupon && !(await reserveCouponUse(coupon.id, user.id, orderId))) {
    await fail(409, 'This coupon has been used up or you already used it.', 'coupon', taken)
  }
  await col.updateOne({ id: orderId }, { $set: { 'reservation.items': taken } })

  if (pay === 'free') {
    const { settlePaid } = await import('./settle')
    await col.updateOne({ id: orderId }, { $set: { 'payment.ref': `free_${orderId}` } })
    await settlePaid(orderId, { amount: 0, currency, txn: `free_${orderId}` })
    return { order_id: orderId, number: order.number, redirect_url: `/dashboard/orders/${orderId}?paid=1` }
  }

  try {
    const { redirect_url, ref } = await startPayment({ ...order, reservation: { ...order.reservation!, items: taken } })
    await col.updateOne({ id: orderId }, { $set: { 'payment.ref': ref, updated_at: nowIso() } })
    // Abandoned-checkout automation listens for this (and cancels on marketplace.order.paid).
    const { emit } = await import('@/lib/automation/events')
    void emit('marketplace.checkout.created', {
      order_id: orderId, buyer_id: user.id, buyer_email: user.email, total_minor: order.grand_total, currency, resume_url: '/marketplace/checkout',
    }, { idempotencyKey: `marketplace.checkout.created:${orderId}` })
    return { order_id: orderId, number: order.number, redirect_url }
  } catch (e) {
    console.error('[marketplace] payment start failed', { order: orderId, gateway, err: (e as Error)?.message })
    return fail(502, 'We could not start the payment. Nothing was charged — please try again.', 'gateway', taken)
  }
}
