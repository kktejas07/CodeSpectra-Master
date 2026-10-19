/**
 * Marketplace buyer part: money math in minor units (tax / shipping / discount / commission),
 * currency rules, oversell protection under concurrency, webhook idempotency, refund
 * eligibility by kind, signed download links (expiry + limits) and booking slots across
 * time zones.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakeDb } from './helpers/fake-mongo'

const db = { current: new FakeDb() }
vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => db.current }))
const ledger = { sales: new Set<string>(), recordSale: vi.fn(async (o: { id: string; lines: { id: string }[] }) => { for (const l of o.lines) ledger.sales.add(`${o.id}:${l.id}`) }) }
vi.mock('@/lib/marketplace/ledger', () => ({ recordSale: (o: never) => ledger.recordSale(o), recordRefund: vi.fn(async () => {}), commissionFor: () => 1500 }))
const mail = { confirmation: vi.fn(async () => {}), failed: vi.fn(async () => {}), download: vi.fn(async () => {}), booking: vi.fn(async () => {}) }
vi.mock('@/lib/marketplace/emails', () => ({
  sendOrderConfirmation: (...a: unknown[]) => mail.confirmation(...(a as [])),
  sendPaymentFailed: (...a: unknown[]) => mail.failed(...(a as [])),
  sendDownloadReady: (...a: unknown[]) => mail.download(...(a as [])),
  sendBookingConfirmation: (...a: unknown[]) => mail.booking(...(a as [])),
  sendBookingReminder: vi.fn(async () => {}),
}))
vi.mock('@/lib/notifications', () => ({ notify: vi.fn(async () => null) }))
vi.mock('@/lib/db/billing', () => ({ finalizeCouponRedemption: vi.fn(async () => true), reserveCouponUse: vi.fn(async () => true) }))
const refunds = { refundLines: vi.fn(async () => {}) }
vi.mock('@/lib/marketplace/orders', () => ({ refundLines: (...a: unknown[]) => refunds.refundLines(...(a as [])) }))
vi.mock('@/lib/marketplace/gateways', () => ({ fetchGatewayState: vi.fn(async () => ({ state: 'pending' })), isMarketplaceTxn: (t: string) => /^MKT/.test(t), closePaymentPage: vi.fn(async () => true) }))

import { allocateProRata, chargeable, computeQuote, couponDiscount, currencyDecision, linePaid, taxOn } from '@/lib/marketplace/pricing'
import { cancelEligibility, canReview, needsModeration, refundEligibility } from '@/lib/marketplace/rules'
import { DOWNLOAD_TTL_MS, downloadsLeft, signDownloadToken, verifyDownloadToken } from '@/lib/marketplace/download-token'
import { generateSlots, isBookableSlot, tzOffsetMs, zonedWallToUtc } from '@/lib/marketplace/slots'
import { parseCheckoutInput, shipsTo } from '@/lib/marketplace/checkout'
import { reserveAll, takeOne } from '@/lib/marketplace/stock'
import { settlePaid } from '@/lib/marketplace/settle'
import { consumeDownload } from '@/lib/marketplace/digital'
import { __resetMarketplaceIndexes } from '@/lib/marketplace/db'
import { buildInvoiceHtml } from '@/lib/marketplace/invoice'

const TAX_IN = { tax: { in_gst_bps: 1800, us_sales_tax_bps: 700, prices_include_tax: true } }
const TAX_ADD = { tax: { in_gst_bps: 1800, us_sales_tax_bps: 700, prices_include_tax: false } }

beforeEach(() => {
  db.current = new FakeDb()
  __resetMarketplaceIndexes()
  ledger.sales.clear()
  vi.clearAllMocks()
})

// ─── Money math ──────────────────────────────────────────────────────────────

describe('pricing (minor units)', () => {
  it('splits a discount pro-rata with exact integer parts', () => {
    expect(allocateProRata(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(allocateProRata(1001, [5000, 2500, 2500]).reduce((a, b) => a + b, 0)).toBe(1001)
    expect(allocateProRata(0, [1, 2])).toEqual([0, 0])
  })

  it('tax included in price (GST 18%) is extracted, not added', () => {
    expect(taxOn(11800, 1800, true)).toBe(1800)
    const q = computeQuote([{ key: 'a', seller_id: 's1', kind: 'digital', unit_price: 11800, qty: 1, commission_bps: 1500 }], { currency: 'INR', settings: TAX_IN })
    expect(q).toMatchObject({ subtotal: 11800, tax_total: 1800, grand_total: 11800, shipping_total: 0 })
    // commission on the ex-tax base: 10000 × 15% = 1500
    expect(q.lines[0]).toMatchObject({ base: 10000, commission_amount: 1500, seller_earnings: 8500 })
  })

  it('sales tax added on top (US 7%) and shipping per seller with free-over threshold', () => {
    const q = computeQuote([
      { key: 'book', seller_id: 's1', kind: 'physical', unit_price: 2000, qty: 2, commission_bps: 1000, shipping: { fee: 500, free_over: 10000 } },
      { key: 'mug', seller_id: 's1', kind: 'physical', unit_price: 1500, qty: 1, commission_bps: 1000, shipping: { fee: 700, free_over: null } },
      { key: 'tee', seller_id: 's2', kind: 'physical', unit_price: 3000, qty: 1, commission_bps: 1000, shipping: { fee: 400, free_over: 2500 } },
    ], { currency: 'USD', settings: TAX_ADD })
    // s1: highest fee 700 on the mug line; s2: 3000 ≥ 2500 → free
    expect(q.shipping_total).toBe(700)
    expect(q.lines.find((l) => l.key === 'mug')!.shipping_amount).toBe(700)
    expect(q.subtotal).toBe(8500)
    // tax = 7% of (4000) + 7% of (1500 + 700) + 7% of 3000 = 280 + 154 + 210
    expect(q.tax_total).toBe(644)
    expect(q.grand_total).toBe(8500 + 700 + 644)
  })

  it('coupon discount is clamped and every line adds up to the grand total', () => {
    expect(couponDiscount(5000, { discount_type: 'percentage', discount_value: 10 }, 'INR')).toBe(500)
    expect(couponDiscount(5000, { discount_type: 'flat', discount_value: 80 }, 'INR')).toBe(5000)
    expect(couponDiscount(5000, { discount_type: 'trial', discount_value: 30 }, 'INR')).toBe(0)
    for (const settings of [TAX_IN, TAX_ADD]) {
      const q = computeQuote([
        { key: 'a', seller_id: 's1', kind: 'physical', unit_price: 3333, qty: 3, commission_bps: 1500, shipping: { fee: 499 } },
        { key: 'b', seller_id: 's2', kind: 'digital', unit_price: 1999, qty: 1, commission_bps: 0 },
      ], { currency: 'INR', settings, discount: 777 })
      expect(q.discount_total).toBe(777)
      const lines = q.lines.map((l) => ({ line_total: l.base, shipping_amount: l.shipping_amount, tax: l.tax }))
      expect(lines.reduce((a, l) => a + linePaid(l), 0)).toBe(q.grand_total)
      for (const l of q.lines) expect(l.commission_amount + l.seller_earnings).toBe(l.base)
      for (const v of [q.subtotal, q.tax_total, q.grand_total, ...q.lines.map((l) => l.tax)]) expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('rejects non-integer prices', () => {
    expect(() => computeQuote([{ key: 'x', seller_id: 's', kind: 'digital', unit_price: 9.99, qty: 1, commission_bps: 0 }], { currency: 'USD', settings: TAX_ADD })).toThrow()
  })

  it('gateway minimums and free orders', () => {
    expect(chargeable(0, 'INR')).toBe('free')
    expect(chargeable(99, 'INR')).toBe('too_small')
    expect(chargeable(100, 'INR')).toBe('ok')
    expect(chargeable(49, 'USD')).toBe('too_small')
  })
})

describe('currency rules', () => {
  it('one currency per cart', () => {
    expect(currencyDecision({ currency: 'INR', lines: [{}] }, 'INR')).toBe('ok')
    expect(currencyDecision({ currency: 'INR', lines: [] }, 'USD')).toBe('adopt')
    expect(currencyDecision({ currency: 'INR', lines: [{}] }, 'USD')).toBe('switch_required')
  })
})

describe('checkout input', () => {
  it('validates phone and address; shipping regions', () => {
    expect(parseCheckoutInput({ contact_phone: '12' }).ok).toBe(false)
    expect(parseCheckoutInput({ contact_phone: '+91 98765 43210', coupon: 'save10' })).toMatchObject({ ok: true, value: { coupon: 'SAVE10' } })
    expect(parseCheckoutInput({ contact_phone: '+91 98765 43210', address: { name: 'A', line1: 'x', city: 'Hyd', state: 'TS', postal_code: '500001', country: 'india' } }).ok).toBe(false)
    expect(shipsTo([], 'US')).toBe(true)
    expect(shipsTo(['IN'], 'US')).toBe(false)
    expect(shipsTo(['*'], 'US')).toBe(true)
  })
})

// ─── Refund / cancel / review rules ──────────────────────────────────────────

describe('refund eligibility by kind', () => {
  const now = Date.parse('2026-10-19T12:00:00Z')
  const paid = { status: 'paid' as const, payment: { status: 'succeeded', paid_at: '2026-10-18T12:00:00Z' } }
  const settings = { hold_days: { digital: 7, physical: 14, service: 3 } }

  it('digital: only if never downloaded and within the window', () => {
    expect(refundEligibility(paid, { kind: 'digital', fulfilment: { status: 'delivered_digital', downloads_used: 0 } }, settings, now)).toEqual({ ok: true, mode: 'auto' })
    expect(refundEligibility(paid, { kind: 'digital', fulfilment: { status: 'delivered_digital', downloads_used: 1 } }, settings, now).ok).toBe(false)
    expect(refundEligibility(paid, { kind: 'digital', fulfilment: { status: 'delivered_digital', downloads_used: 0 } }, settings, now + 8 * 86_400_000).ok).toBe(false)
  })

  it('service: before the cutoff only', () => {
    const line = (start: string) => ({ kind: 'service' as const, fulfilment: { status: 'booked' as const, booking: { start, end: start } } })
    expect(refundEligibility(paid, line('2026-10-21T12:00:00Z'), settings, now, 24)).toEqual({ ok: true, mode: 'auto' })
    expect(refundEligibility(paid, line('2026-10-20T06:00:00Z'), settings, now, 24).ok).toBe(false)
  })

  it('physical: cancel before dispatch (auto), return within N days of delivery (review)', () => {
    expect(cancelEligibility(paid, { kind: 'physical', fulfilment: { status: 'processing' } }, now)).toEqual({ ok: true, mode: 'auto' })
    expect(cancelEligibility(paid, { kind: 'physical', fulfilment: { status: 'shipped' } }, now).ok).toBe(false)
    const delivered = { kind: 'physical' as const, fulfilment: { status: 'delivered' as const, delivered_at: '2026-10-10T00:00:00Z' } }
    expect(refundEligibility(paid, delivered, settings, now)).toEqual({ ok: true, mode: 'review' })
    expect(refundEligibility(paid, delivered, settings, Date.parse('2026-10-30T00:00:00Z')).ok).toBe(false)
  })

  it('nothing is refundable twice or before payment', () => {
    expect(refundEligibility({ status: 'pending_payment', payment: { status: 'pending' } }, { kind: 'digital', fulfilment: { status: 'unfulfilled' } }, settings, now).ok).toBe(false)
    expect(refundEligibility(paid, { kind: 'digital', fulfilment: { status: 'cancelled' } }, settings, now).ok).toBe(false)
  })

  it('reviews after delivery / completion; links go to moderation', () => {
    expect(canReview(paid, { kind: 'physical', fulfilment: { status: 'shipped' } }, now)).toBe(false)
    expect(canReview(paid, { kind: 'physical', fulfilment: { status: 'delivered' } }, now)).toBe(true)
    expect(canReview(paid, { kind: 'service', fulfilment: { status: 'booked', booking: { start: '2026-10-19T09:00:00Z', end: '2026-10-19T10:00:00Z' } } }, now)).toBe(true)
    expect(needsModeration('Great book, visit https://spam.example')).toBe(true)
    expect(needsModeration('Great book, very clear explanations')).toBe(false)
  })
})

// ─── Signed downloads ────────────────────────────────────────────────────────

describe('signed download links', () => {
  const key = new Uint8Array(32).fill(3)
  const claims = { o: 'order-1', l: 'line-1', f: 'file-1', u: 'user-1' }

  it('verifies, expires, and rejects tampering or another key', () => {
    const t0 = 1_000_000
    const tok = signDownloadToken(key, claims, t0)
    expect(verifyDownloadToken(key, tok, t0 + 1000)).toMatchObject(claims)
    expect(verifyDownloadToken(key, tok, t0 + DOWNLOAD_TTL_MS + 1)).toBeNull()
    expect(verifyDownloadToken(new Uint8Array(32).fill(4), tok, t0)).toBeNull()
    const [body, sig] = tok.split('.')
    const forged = Buffer.from(JSON.stringify({ ...claims, u: 'attacker', e: t0 + 9e9 })).toString('base64url')
    expect(verifyDownloadToken(key, `${forged}.${sig}`, t0)).toBeNull()
    expect(verifyDownloadToken(key, `${body}.`, t0)).toBeNull()
  })

  it('download limit is enforced atomically under parallel clicks', async () => {
    expect(downloadsLeft(2, 3)).toBe(1)
    expect(downloadsLeft(5, 0)).toBe(Infinity)
    // consumeDownload first claims the (unrefunded, delivered) order line itself
    for (const id of ['o1', 'o2']) {
      await db.current.collection('mkt_orders').insertOne({ id, lines: [{ id: 'l1', kind: 'digital', fulfilment: { status: 'delivered_digital', downloads_used: 0 } }] } as never)
    }
    const results = await Promise.all(Array.from({ length: 6 }, () => consumeDownload('o1', 'l1', 3)))
    expect(results.filter(Boolean)).toHaveLength(3)
    expect(await consumeDownload('o1', 'l1', 3)).toBe(false)
    const unlimited = await Promise.all(Array.from({ length: 4 }, () => consumeDownload('o2', 'l1', 0)))
    expect(unlimited.every(Boolean)).toBe(true)
  })
})

// ─── Booking slots across time zones ─────────────────────────────────────────

describe('booking slots', () => {
  it('converts seller wall-clock time to UTC (IST and New York across DST)', () => {
    expect(tzOffsetMs('Asia/Kolkata', Date.parse('2026-10-19T00:00:00Z'))).toBe(330 * 60_000)
    expect(new Date(zonedWallToUtc(2026, 10, 19, 9 * 60, 'Asia/Kolkata')).toISOString()).toBe('2026-10-19T03:30:00.000Z')
    expect(new Date(zonedWallToUtc(2026, 3, 2, 9 * 60, 'America/New_York')).toISOString()).toBe('2026-03-02T14:00:00.000Z') // EST
    expect(new Date(zonedWallToUtc(2026, 3, 9, 9 * 60, 'America/New_York')).toISOString()).toBe('2026-03-09T13:00:00.000Z') // EDT
  })

  it('generates weekly slots with duration + buffer, skipping taken times and the lead window', () => {
    const spec = { duration_min: 45, buffer_min: 15, timezone: 'Asia/Kolkata', weekly: [{ dow: 1, start: '09:00', end: '12:00' }] } // Mondays
    const from = Date.parse('2026-10-19T00:00:00Z') // Monday
    const slots = generateSlots(spec, { fromMs: from, toMs: from + 7 * 86_400_000, nowMs: from - 86_400_000 })
    expect(slots).toEqual(['2026-10-19T03:30:00.000Z', '2026-10-19T04:30:00.000Z', '2026-10-19T05:30:00.000Z'])
    const taken = generateSlots(spec, { fromMs: from, toMs: from + 7 * 86_400_000, nowMs: from - 86_400_000, taken: [{ start: '2026-10-19T04:30:00.000Z', end: '2026-10-19T05:15:00.000Z' }] })
    // 04:30–05:15 is taken; with the 15-min buffer the 05:30 slot still fits
    expect(taken).toEqual(['2026-10-19T03:30:00.000Z', '2026-10-19T05:30:00.000Z'])
    // 2-hour lead time: at 02:00Z only 04:30 and 05:30 are bookable
    expect(generateSlots(spec, { fromMs: from, toMs: from + 86_400_000, nowMs: Date.parse('2026-10-19T02:00:00Z') })).toEqual(['2026-10-19T04:30:00.000Z', '2026-10-19T05:30:00.000Z'])
  })

  it('a New York seller is shown at the same instant to a buyer anywhere; DST shifts the UTC time', () => {
    const spec = { duration_min: 60, timezone: 'America/New_York', weekly: [{ dow: 1, start: '09:00', end: '10:00' }] }
    const slots = generateSlots(spec, { fromMs: Date.parse('2026-03-01T00:00:00Z'), toMs: Date.parse('2026-03-12T00:00:00Z'), nowMs: 0 })
    expect(slots).toEqual(['2026-03-02T14:00:00.000Z', '2026-03-09T13:00:00.000Z'])
    expect(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }).format(new Date(slots[1]))).toBe('18:30')
    expect(isBookableSlot(spec, '2026-03-09T13:00:00.000Z', { nowMs: 0 })).toBe(true)
    expect(isBookableSlot(spec, '2026-03-09T14:00:00.000Z', { nowMs: 0 })).toBe(false)
  })
})

// ─── Stock race ──────────────────────────────────────────────────────────────

describe('stock reservation (oversell protection)', () => {
  it('ten buyers race for three units — exactly three win', async () => {
    await db.current.collection('mkt_products').insertOne({ id: 'p1', stock: 3, status: 'published' })
    const results = await Promise.all(Array.from({ length: 10 }, () => takeOne({ product_id: 'p1', qty: 1 })))
    expect(results.filter((r) => r === 'taken')).toHaveLength(3)
    expect((await db.current.collection('mkt_products').findOne({ id: 'p1' }))!.stock).toBe(0)
  })

  it('all-or-nothing: a short item rolls back what was already taken', async () => {
    const col = db.current.collection('mkt_products')
    await col.insertOne({ id: 'a', stock: 5 })
    await col.insertOne({ id: 'b', stock: 1 })
    await col.insertOne({ id: 'c', stock: null })
    const r = await reserveAll([{ product_id: 'a', qty: 2 }, { product_id: 'c', qty: 9 }, { product_id: 'b', qty: 2 }])
    expect(r.short?.product_id).toBe('b')
    expect((await col.findOne({ id: 'a' }))!.stock).toBe(5)
    const ok = await reserveAll([{ product_id: 'a', qty: 2 }, { product_id: 'c', qty: 9 }])
    expect(ok.short).toBeNull()
    expect(ok.taken).toEqual([{ product_id: 'a', qty: 2 }]) // unlimited items are not counted
  })
})

// ─── Webhook idempotency ─────────────────────────────────────────────────────

function orderDoc(over: Record<string, unknown> = {}) {
  return {
    id: 'ord-1', number: 'CS-2026-000001', buyer_id: 'u1', buyer_email: 'b@example.com', currency: 'INR',
    lines: [{ id: 'l1', product_id: 'p1', seller_id: 's1', kind: 'digital', title: 'E-book', qty: 1, unit_price: 11800, gross: 11800, discount: 0, tax: 1800, shipping_amount: 0, line_total: 10000, commission_bps: 1500, commission_amount: 1500, seller_earnings: 8500, digital: { file_ids: ['f1'], download_limit: 3 }, fulfilment: { status: 'unfulfilled', downloads_used: 0 } }],
    subtotal: 11800, shipping_total: 0, tax_total: 1800, discount_total: 0, grand_total: 11800, prices_include_tax: true,
    payment: { gateway: 'phonepe', status: 'pending', ref: 'MKTabc' }, status: 'pending_payment',
    reservation: { status: 'held', expires_at: '2026-10-19T00:30:00Z', items: [] },
    created_at: '2026-10-19T00:00:00Z', updated_at: '2026-10-19T00:00:00Z',
    ...over,
  }
}

describe('payment settlement is idempotent', () => {
  it('replayed and concurrent webhooks settle once', async () => {
    const col = db.current.collection('mkt_orders')
    await col.insertOne(orderDoc())
    const g = { amount: 11800, currency: 'INR', txn: 'T1' }
    const out = await Promise.all([settlePaid('ord-1', g), settlePaid('ord-1', g), settlePaid('ord-1', g)])
    expect(out.filter((x) => x === 'paid')).toHaveLength(1)
    expect(await settlePaid('ord-1', g)).toBe('already')
    const o = (await col.findOne({ id: 'ord-1' }))!
    expect(o.status).toBe('paid')
    expect(o.payment.status).toBe('succeeded')
    expect(o.reservation.status).toBe('committed')
    expect(o.lines[0].fulfilment.status).toBe('delivered_digital')
    expect(mail.confirmation).toHaveBeenCalledTimes(1)
    expect(mail.download).toHaveBeenCalledTimes(1)
    expect([...ledger.sales]).toEqual(['ord-1:l1'])
  })

  it('never settles a short or wrong-currency payment', async () => {
    await db.current.collection('mkt_orders').insertOne(orderDoc())
    expect(await settlePaid('ord-1', { amount: 11799, currency: 'INR', txn: 'T' })).toBe('mismatch')
    expect(await settlePaid('ord-1', { amount: 11800, currency: 'USD', txn: 'T' })).toBe('mismatch')
    expect((await db.current.collection('mkt_orders').findOne({ id: 'ord-1' }))!.status).toBe('pending_payment')
    expect(ledger.recordSale).not.toHaveBeenCalled()
  })

  it('a late payment after the hold was released re-reserves, and refunds what sold out', async () => {
    await db.current.collection('mkt_products').insertOne({ id: 'p9', stock: 0 })
    await db.current.collection('mkt_orders').insertOne(orderDoc({
      status: 'cancelled', payment: { gateway: 'phonepe', status: 'failed', ref: 'MKTabc' },
      reservation: { status: 'released', expires_at: '2026-10-19T00:30:00Z', items: [] },
      lines: [{ id: 'lp', product_id: 'p9', seller_id: 's1', kind: 'physical', title: 'Book', qty: 1, unit_price: 11800, gross: 11800, discount: 0, tax: 1800, shipping_amount: 0, line_total: 10000, commission_bps: 0, commission_amount: 0, seller_earnings: 10000, fulfilment: { status: 'unfulfilled' } }],
    }))
    expect(await settlePaid('ord-1', { amount: 11800, currency: 'INR', txn: 'T2' })).toBe('paid')
    const o = (await db.current.collection('mkt_orders').findOne({ id: 'ord-1' }))!
    expect(o.unavailable_line_ids).toEqual(['lp'])
    expect(refunds.refundLines).toHaveBeenCalledWith('ord-1', ['lp'], 11800, 'auto-ord-1', { reason: 'unavailable', restock: false })
  })
})

describe('invoice', () => {
  it('escapes seller-provided text and shows the tax line', () => {
    const html = buildInvoiceHtml(orderDoc({ payment: { gateway: 'stripe', status: 'succeeded' }, tax_bps: 1800, lines: [{ ...orderDoc().lines[0], title: '<script>x</script>' }] }) as never, { s1: { name: 'Shop & Co' } }, { name: 'CodeSpectra' })
    expect(html).not.toContain('<script>x')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('GST @ 18% (included)')
  })
})
