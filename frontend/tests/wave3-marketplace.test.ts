/**
 * Wave 3 review fixes (marketplace + subscriptions money paths) on the in-memory MongoDB, with the
 * racing calls actually interleaved (Promise.all) so the conditional updates are what decides:
 *  W3-02 per-line refund claim + guarded refunded_total · W3-09 resumable refund phases ·
 *  W3-13 download vs refund · W3-03 payouts paying CAS / reconcile · W3-08 destination snapshot ·
 *  W3-05 order-bound coupons · W3-06 ledger shipping · W3-07 service completion · W3-10 stock
 *  deltas + stable variant ids · W3-14 seller-cancel amount · W3-20 sold files archived · GSTIN.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeDb } from './helpers/fake-mongo'

const db = vi.hoisted(() => ({ current: null as unknown as import('./helpers/fake-mongo').FakeDb }))
vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => db.current }))

const gw = vi.hoisted(() => ({ refund: vi.fn(async (..._a: unknown[]) => ({ ok: true, ref: 're_1' })) }))
vi.mock('@/lib/marketplace/gateways', () => ({
  gatewayRefund: (...a: unknown[]) => gw.refund(...a),
  fetchGatewayState: vi.fn(async () => ({ state: 'pending' })),
  isMarketplaceTxn: (t: string) => /^MKT/.test(t),
  pickGateway: vi.fn(async () => 'stripe'),
  startPayment: vi.fn(),
}))
const ledgerSpy = vi.hoisted(() => ({ recordRefund: vi.fn(async (..._a: unknown[]) => {}) }))
vi.mock('@/lib/marketplace/ledger', async (orig) => {
  const real = await orig<typeof import('@/lib/marketplace/ledger')>()
  return { ...real, recordRefund: (...a: unknown[]) => ledgerSpy.recordRefund(...a) }
})
vi.mock('@/lib/marketplace/emails', () => ({
  sendRefundProcessed: vi.fn(async () => {}), sendOrderConfirmation: vi.fn(async () => {}), sendDownloadReady: vi.fn(async () => {}),
  sendBookingConfirmation: vi.fn(async () => {}), sendBookingReminder: vi.fn(async () => {}), sendPaymentFailed: vi.fn(async () => {}), sendShippedEmail: vi.fn(async () => {}),
}))
const notifyMock = vi.hoisted(() => ({ notify: vi.fn(async (..._a: unknown[]) => null) }))
vi.mock('@/lib/notifications', () => ({ notify: (...a: unknown[]) => notifyMock.notify(...a) }))
vi.mock('@/lib/marketplace/seller-notify', () => ({
  notifySeller: vi.fn(async () => {}), notifyAdmins: vi.fn(async () => {}), onSaleRecorded: vi.fn(async () => {}),
  checkLowStock: vi.fn(async () => {}), isLowStock: () => false,
}))
vi.mock('@/lib/automation/events', () => ({ emit: vi.fn(async () => null) }))
vi.mock('@/lib/rag/hooks', () => ({ knowledgeOnMarketplaceProduct: vi.fn(), knowledgeOnLearnPost: vi.fn() }))
vi.mock('@/lib/s3-storage', () => ({ readS3Config: async () => null }))
const stripe = vi.hoisted(() => ({
  list: vi.fn(async (..._a: unknown[]) => ({ data: [] as { id: string }[] })),
  create: vi.fn(async (..._a: unknown[]) => ({ id: 'tr_1' })),
}))
vi.mock('@/lib/stripe-client', () => ({
  getStripeClient: async () => ({ transfers: { list: (...a: unknown[]) => stripe.list(...a), create: (...a: unknown[]) => stripe.create(...a) } }),
  getStripeSecretKey: async () => 'sk_test',
}))

import { refundLines, refundPhase } from '@/lib/marketplace/orders'
import { consumeDownload } from '@/lib/marketplace/digital'
import { __resetMarketplaceIndexes } from '@/lib/marketplace/db'
import { decidePayout, destinationBlocker, destinationSnapshot, nextPayoutStatus, reconcilePayout, stripeErrorIsDefinitive } from '@/lib/marketplace/payouts'
import { assertNoOpenPayout, encryptSecret, maskGstin, publicSeller, sellerInvoiceGstin, updateSellerProfile } from '@/lib/marketplace/sellers'
import { buildSaleEntries } from '@/lib/marketplace/ledger'
import { DEFAULT_SETTINGS } from '@/lib/marketplace/settings'
import { sellerCancelRefundAmount, serviceCompletionBlocker } from '@/lib/marketplace/fulfilment'
import { planStockWrite, stabilizeVariantIds, updateProduct } from '@/lib/marketplace/listings'
import { takeOne } from '@/lib/marketplace/stock'
import { deleteSellerFiles } from '@/lib/marketplace/seller-files'
import { buildInvoiceHtml } from '@/lib/marketplace/invoice'
import { finalizeCouponRedemption, releaseCouponReservation, reserveCouponUse } from '@/lib/db/billing'
import { settlePaid } from '@/lib/marketplace/settle'
import type { OrderDoc } from '@/lib/marketplace/order-doc'
import type { SellerDoc } from '@/lib/marketplace/db'

process.env.MARKETPLACE_ENCRYPTION_KEY = 'k'.repeat(40)

const orders = () => db.current.collection('mkt_orders')
const line = (id: string, over: Record<string, unknown> = {}) => ({
  id, product_id: `p_${id}`, seller_id: 's1', kind: 'digital', title: `Item ${id}`, qty: 1, unit_price: 600, line_total: 500, tax: 100, shipping_amount: 0,
  commission_bps: 1000, commission_amount: 50, seller_earnings: 450,
  digital: { file_ids: ['f1'], download_limit: 3 }, fulfilment: { status: 'delivered_digital', downloads_used: 0 }, ...over,
})
async function seedOrder(over: Partial<OrderDoc> = {}, lines = [line('l1'), line('l2')]) {
  const o = {
    id: 'order-000001', number: 'CS-2026-000001', buyer_id: 'b1', buyer_email: 'b@x.com', currency: 'INR',
    lines, subtotal: 1200, shipping_total: 0, tax_total: 200, discount_total: 0, grand_total: lines.reduce((a, l) => a + (l.line_total as number) + (l.tax as number) + ((l.shipping_amount as number) || 0), 0),
    payment: { gateway: 'stripe', status: 'succeeded', paid_at: new Date().toISOString(), intent: 'pi_1', ref: 'cs_1' },
    status: 'paid', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...over,
  }
  await orders().insertOne(o)
  return o
}
const getOrder = async () => (await orders().findOne({ id: 'order-000001' })) as unknown as OrderDoc

beforeEach(() => {
  db.current = new FakeDb()
  __resetMarketplaceIndexes()
  vi.clearAllMocks()
  gw.refund.mockImplementation(async () => ({ ok: true, ref: 're_1' }))
  ledgerSpy.recordRefund.mockImplementation(async () => {})
  stripe.list.mockImplementation(async () => ({ data: [] }))
  stripe.create.mockImplementation(async () => ({ id: 'tr_1' }))
})

describe('W3-02 refunds: atomic per-line claim + guarded refunded_total', () => {
  it('two parallel refunds of the same line (different refund ids) move money once', async () => {
    await seedOrder()
    const r = await Promise.allSettled([
      refundLines('order-000001', ['l1'], 600, 'rA', { reason: 'x', restock: true }),
      refundLines('order-000001', ['l1'], 600, 'rB', { reason: 'x', restock: true }),
    ])
    expect(r.map((x) => x.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect(gw.refund).toHaveBeenCalledTimes(1)
    const o = await getOrder()
    expect(o.payment.refunded_total).toBe(600)
    expect(o.lines[0]).toMatchObject({ refunded_amount: 600, fulfilment: { status: 'cancelled' } })
    expect(o.payment.status).toBe('partially_refunded')
  })

  it('refunded_total can never exceed grand_total (guard in the claim, not a stale read)', async () => {
    await seedOrder()
    await orders().updateOne({ id: 'order-000001' }, { $set: { 'payment.refunded_total': 700 } })
    // 1200 paid, 700 already refunded: each of these alone fits the stale pre-read only together they don't
    const r = await Promise.allSettled([
      refundLines('order-000001', ['l1'], 500, 'rA', { reason: 'x', restock: false }),
      refundLines('order-000001', ['l2'], 500, 'rB', { reason: 'x', restock: false }),
    ])
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    expect((await getOrder()).payment.refunded_total).toBe(1200)
  })

  it('a failed gateway refund releases the claim (line refundable again)', async () => {
    await seedOrder()
    gw.refund.mockImplementationOnce(async () => ({ ok: false, ref: '' }))
    await expect(refundLines('order-000001', ['l1'], 600, 'rA', { reason: 'x', restock: false })).rejects.toThrow(/payment provider/)
    let o = await getOrder()
    expect(o.payment.refunded_total).toBe(0)
    expect(o.lines[0].refund_lock).toBeUndefined()
    await refundLines('order-000001', ['l1'], 600, 'rB', { reason: 'x', restock: false })
    o = await getOrder()
    expect(o.payment.refunded_total).toBe(600)
  })
})

describe('W3-09 refund phases: resumable after the gateway call', () => {
  it('a crash after the gateway refund is finished by the retry (gateway not called again)', async () => {
    await seedOrder()
    ledgerSpy.recordRefund.mockImplementationOnce(async () => { throw new Error('mongo timeout') })
    await expect(refundLines('order-000001', ['l1'], 600, 'rA', { reason: 'x', restock: false })).rejects.toThrow(/mongo timeout/)
    let o = await getOrder()
    expect(refundPhase(o.post?.refund_rA)?.phase).toBe('gateway')
    expect(o.lines[0].refunded_amount ?? 0).toBe(0)
    // the retry passes a different amount — the claimed one wins
    await refundLines('order-000001', ['l1'], 1, 'rA', { reason: 'x', restock: false })
    o = await getOrder()
    expect(gw.refund).toHaveBeenCalledTimes(1)
    expect(ledgerSpy.recordRefund).toHaveBeenCalledTimes(2)
    expect(ledgerSpy.recordRefund.mock.calls[1][2]).toBe(600)
    expect(o.lines[0]).toMatchObject({ refunded_amount: 600, fulfilment: { status: 'cancelled' } })
    expect(refundPhase(o.post?.refund_rA)?.phase).toBe('done')
    await refundLines('order-000001', ['l1'], 600, 'rA', { reason: 'x', restock: false }) // replay: no-op
    expect(gw.refund).toHaveBeenCalledTimes(1)
    expect(notifyMock.notify).toHaveBeenCalledTimes(1)
  })
  it('legacy markers (bare ISO time) count as done', () => {
    expect(refundPhase('2026-10-19T00:00:00Z')?.phase).toBe('done')
    expect(refundPhase('claimed|2026-10-19T00:00:00Z')?.phase).toBe('claimed')
    expect(refundPhase(undefined)).toBeNull()
  })
  it('restocks a physical line exactly once across retries', async () => {
    await db.current.collection('mkt_products').insertOne({ id: 'p_l1', stock: 3 })
    await seedOrder({}, [line('l1', { kind: 'physical', digital: null, fulfilment: { status: 'unfulfilled' } }), line('l2')])
    ledgerSpy.recordRefund.mockImplementationOnce(async () => { throw new Error('boom') })
    await expect(refundLines('order-000001', ['l1'], 600, 'rA', { reason: 'x', restock: true })).rejects.toThrow()
    await refundLines('order-000001', ['l1'], 600, 'rA', { reason: 'x', restock: true })
    await refundLines('order-000001', ['l1'], 600, 'rA', { reason: 'x', restock: true })
    expect((await db.current.collection('mkt_products').findOne({ id: 'p_l1' }))?.stock).toBe(4)
  })
})

describe('W3-13 digital refund vs download', () => {
  it('a download and a buyer refund racing on the same line: exactly one wins', async () => {
    for (const first of ['download', 'refund'] as const) {
      db.current = new FakeDb(); __resetMarketplaceIndexes(); gw.refund.mockClear()
      await seedOrder()
      const dl = () => consumeDownload('order-000001', 'l1', 3)
      const rf = () => refundLines('order-000001', ['l1'], 600, `r-${first}`, { reason: 'x', restock: false, requireNotDownloaded: true })
      const [a, b] = await Promise.allSettled(first === 'download' ? [dl(), rf()] : [rf(), dl()])
      const downloaded = (first === 'download' ? a : b)
      const refunded = (first === 'download' ? b : a)
      const gotFile = downloaded.status === 'fulfilled' && downloaded.value === true
      const gotMoney = refunded.status === 'fulfilled'
      expect(gotFile !== gotMoney).toBe(true)
      expect(gw.refund).toHaveBeenCalledTimes(gotMoney ? 1 : 0)
    }
  })
  it('admin-approved refunds may still refund a downloaded item', async () => {
    await seedOrder()
    expect(await consumeDownload('order-000001', 'l1', 3)).toBe(true)
    await refundLines('order-000001', ['l1'], 600, 'admin-1', { reason: 'approved', restock: false })
    expect((await getOrder()).lines[0].refunded_amount).toBe(600)
    expect(await consumeDownload('order-000001', 'l1', 3)).toBe(false) // refunded: no more downloads
  })
})

// ─── Payouts ────────────────────────────────────────────────────────────────

const seller = (over: Partial<SellerDoc> = {}): SellerDoc => ({
  id: 's1', user_id: 'u1', is_platform: false, display_name: 'Shop', slug: 'shop', country: 'US', status: 'approved', commission_bps: null,
  kyc: { status: 'verified' }, payout: { method: 'stripe_connect', account_ref: 'Stripe account', verified: true },
  stripe_account_id: 'acct_1', payout_secret: null, created_at: 'x', updated_at: 'x', ...over,
})
async function seedPayout(status: string, s = seller(), over: Record<string, unknown> = {}) {
  await db.current.collection('mkt_sellers').insertOne(s)
  await db.current.collection('mkt_payouts').insertOne({ id: 'po1', seller_id: s.id, currency: 'USD', amount: 5000, method: s.payout.method, status, requested_at: 'x', open: true, destination: destinationSnapshot(s), ...over })
  await db.current.collection('mkt_ledger').insertOne({ id: 'e1', idem_key: 'payout:po1', payout_id: 'po1', seller_id: s.id, currency: 'USD', type: 'payout', amount: -5000, available_at: 'x', created_at: 'x' })
}
const payout = async () => db.current.collection('mkt_payouts').findOne({ id: 'po1' })
const reversals = () => db.current.collection('mkt_ledger').docs.filter((d) => d.idem_key === 'payout_reversal:po1')

describe('W3-03 payouts: paying CAS, no fail/cancel mid-transfer, reconcile', () => {
  it('pure transitions: paying can not be failed / cancelled / re-paid', () => {
    expect(nextPayoutStatus('paying', 'failed')).toBeNull()
    expect(nextPayoutStatus('paying', 'cancel')).toBeNull()
    expect(nextPayoutStatus('paying', 'paid')).toBeNull()
    expect(nextPayoutStatus('approved', 'failed')).toBe('failed')
    expect(stripeErrorIsDefinitive({ type: 'StripeConnectionError' })).toBe(false)
    expect(stripeErrorIsDefinitive({ type: 'StripeAPIError', statusCode: 500 })).toBe(false)
    expect(stripeErrorIsDefinitive({ type: 'StripeInvalidRequestError', statusCode: 400 })).toBe(true)
    expect(stripeErrorIsDefinitive(new Error('socket hang up'))).toBe(false)
  })

  it('Paid and Failed clicked together: never paid AND reversed', async () => {
    await seedPayout('approved')
    let release!: () => void
    stripe.create.mockImplementationOnce(() => new Promise((r) => { release = () => r({ id: 'tr_1' }) }))
    const paid = decidePayout('adminA', 'po1', 'paid')
    await vi.waitFor(() => expect(stripe.create).toHaveBeenCalled())
    await expect(decidePayout('adminB', 'po1', 'failed', { reason: 'x' })).rejects.toThrow(/in progress/)
    release()
    await paid
    expect((await payout())?.status).toBe('paid')
    expect(reversals()).toHaveLength(0)
  })

  it('a transfer timeout stays paying (no reversal) and reconciles by transfer group / idempotency key', async () => {
    await seedPayout('approved')
    stripe.create.mockImplementationOnce(async () => { throw Object.assign(new Error('timeout'), { type: 'StripeConnectionError' }) })
    await expect(decidePayout('adminA', 'po1', 'paid')).rejects.toThrow(/Reconcile/)
    expect((await payout())?.status).toBe('paying')
    expect(reversals()).toHaveLength(0)
    stripe.list.mockImplementationOnce(async () => ({ data: [{ id: 'tr_9' }] }))
    const done = await reconcilePayout('adminA', 'po1')
    expect(done.status).toBe('paid')
    expect((await payout())).toMatchObject({ status: 'paid', stripe_transfer_id: 'tr_9' })
    expect(stripe.create).toHaveBeenCalledTimes(1) // the timed-out one only; never a second transfer
    expect(stripe.create.mock.calls[0][1]).toEqual({ idempotencyKey: 'mkt-payout-po1' })
  })

  it('a definitive Stripe refusal fails it with exactly one reversal', async () => {
    await seedPayout('approved')
    stripe.create.mockImplementationOnce(async () => { throw Object.assign(new Error('No such destination'), { type: 'StripeInvalidRequestError', statusCode: 400 }) })
    await expect(decidePayout('adminA', 'po1', 'paid')).rejects.toThrow(/refused/)
    expect((await payout())?.status).toBe('failed')
    expect(reversals()).toHaveLength(1)
  })
})

describe('W3-08 payout destination snapshot', () => {
  const bank = async (acct: string) => seller({ country: 'IN', payout: { method: 'bank', account_ref: 'HDFC ••1234', verified: true }, stripe_account_id: null, payout_secret: await encryptSecret({ account_no: acct, ifsc: 'HDFC0001234' }) })

  it('details changed after the request block approve / paid; unverified details block manual paid', async () => {
    const s = await bank('111122223333')
    const p = { method: 'bank' as const, destination: destinationSnapshot(s) }
    expect(destinationBlocker(p, s)).toBeNull()
    const changed = { ...s, payout_secret: await encryptSecret({ account_no: '999988887777', ifsc: 'HDFC0001234' }) }
    expect(destinationBlocker(p, changed)).toMatch(/changed their payout details/)
    expect(destinationBlocker(p, { ...s, payout: { ...s.payout, verified: false } })).toMatch(/not verified/)
    expect(destinationBlocker({ method: 'bank', destination: { ...p.destination, verified: false } }, s)).toMatch(/not verified/)

    await seedPayout('approved', s)
    await db.current.collection('mkt_sellers').updateOne({ id: 's1' }, { $set: { payout_secret: changed.payout_secret } })
    await expect(decidePayout('admin', 'po1', 'paid', { ref: 'UTR123' })).rejects.toThrow(/changed their payout details/)
    expect((await payout())?.status).toBe('approved')
  })

  it('payout edits are blocked while a payout is open', async () => {
    const s = await bank('111122223333')
    await seedPayout('requested', s)
    await expect(assertNoOpenPayout('s1')).rejects.toThrow(/payout in progress/)
    await expect(updateSellerProfile(s, { payout: { method: 'upi', upi: 'xy@okhdfc' } })).rejects.toThrow(/payout in progress/)
    await db.current.collection('mkt_payouts').updateOne({ id: 'po1' }, { $unset: { open: '' }, $set: { status: 'paid' } })
    await expect(updateSellerProfile(s, { payout: { method: 'upi', upi: 'xy@okhdfc' } })).resolves.toMatchObject({ payout: { method: 'upi', verified: false } })
  })
})

// ─── Coupons ────────────────────────────────────────────────────────────────

describe('W3-05 coupon reservations are bound to an order', () => {
  beforeEach(async () => {
    await db.current.collection('billing_coupons').insertOne({ id: 'c1', code: 'ONCE', active: true, max_uses: 1, current_uses: 0, redemptions: [] })
  })
  const coupon = async () => db.current.collection('billing_coupons').findOne({ id: 'c1' })

  it('a second open checkout can not reuse the reservation; release frees it', async () => {
    expect(await reserveCouponUse('c1', 'b1', 'o1')).toBe(true)
    expect(await reserveCouponUse('c1', 'b1', 'o1')).toBe(true) // retry for the same order
    expect(await reserveCouponUse('c1', 'b1', 'o2')).toBe(false)
    expect(await releaseCouponReservation('c1', 'b1', 'o1')).toBe(true)
    expect(await releaseCouponReservation('c1', 'b1', 'o1')).toBe(false) // idempotent
    expect((await coupon())?.current_uses).toBe(0)
    expect(await reserveCouponUse('c1', 'b1', 'o2')).toBe(true)
    // late payment of the released order: not entitled (o2 holds the only use)
    expect(await finalizeCouponRedemption('c1', 'b1', 'o1', undefined, { strictOrder: true })).toBe(false)
    expect(await finalizeCouponRedemption('c1', 'b1', 'o2', undefined, { strictOrder: true })).toBe(true)
    expect(await finalizeCouponRedemption('c1', 'b1', 'o2', undefined, { strictOrder: true })).toBe(true) // replay
    expect((await coupon())?.current_uses).toBe(1)
  })

  it('max_uses is not exhausted by abandoned checkouts', async () => {
    expect(await reserveCouponUse('c1', 'b1', 'o1')).toBe(true)
    expect(await reserveCouponUse('c1', 'b2', 'o9')).toBe(false) // used up while o1 is open
    await releaseCouponReservation('c1', 'b1', 'o1')
    expect(await reserveCouponUse('c1', 'b2', 'o9')).toBe(true)
  })

  it('a paid order whose coupon cannot be redeemed is refunded in full, not fulfilled', async () => {
    await reserveCouponUse('c1', 'b1', 'other-order')
    await seedOrder({ coupon: { id: 'c1', code: 'ONCE' }, status: 'pending_payment', payment: { gateway: 'stripe', status: 'pending', intent: 'pi_1', ref: 'cs_1' } as OrderDoc['payment'] }, [line('l1', { fulfilment: { status: 'unfulfilled' } })])
    expect(await settlePaid('order-000001', { amount: 600, currency: 'INR', txn: 'pi_1', intent: 'pi_1' })).toBe('paid')
    const o = await getOrder()
    expect(o.coupon_conflict).toBe(true)
    expect(gw.refund).toHaveBeenCalledWith(expect.anything(), 600, 'coupon-order-000001')
    expect(o).toMatchObject({ status: 'refunded', payment: { refunded_total: 600 } })
    expect(o.lines[0].fulfilment.status).toBe('cancelled') // never delivered
    expect(o.post?.fulfil).toBeUndefined()
  })
})

// ─── Pure money / fulfilment rules ──────────────────────────────────────────

describe('W3-06 ledger shipping excludes tax', () => {
  it('credits each seller the ex-tax shipping of its lines, not the tax-inclusive shipping_total', () => {
    const o = {
      id: 'o', currency: 'INR', created_at: '2026-01-01T00:00:00Z', payment: { status: 'succeeded', paid_at: '2026-01-01T00:00:00Z' }, status: 'paid',
      shipping_total: 11800, // inclusive: 10000 + 1800 GST
      lines: [
        { id: 'a', seller_id: 's1', kind: 'physical', title: 'A', line_total: 1000, commission_bps: 0, commission_amount: 0, seller_earnings: 1000, shipping_amount: 10000, fulfilment: { status: 'unfulfilled' } },
        { id: 'b', seller_id: 's2', kind: 'physical', title: 'B', line_total: 1000, commission_bps: 0, commission_amount: 0, seller_earnings: 1000, shipping_amount: 0, fulfilment: { status: 'unfulfilled' } },
      ],
    }
    const ship = buildSaleEntries(o as never, DEFAULT_SETTINGS).filter((e) => e.type === 'shipping')
    expect(ship).toEqual([expect.objectContaining({ seller_id: 's1', amount: 10000 })])
  })
})

describe('W3-07 / W3-14 fulfilment rules', () => {
  it('a session can be completed only after it ended', () => {
    const now = Date.parse('2026-10-19T10:00:00Z')
    expect(serviceCompletionBlocker({ fulfilment: { status: 'booked', booking: { start: '2026-10-19T09:00:00Z', end: '2026-10-19T11:00:00Z' } } }, now)).toMatch(/after it has ended/)
    expect(serviceCompletionBlocker({ fulfilment: { status: 'booked', booking: { start: '2026-10-19T08:00:00Z', end: '2026-10-19T09:00:00Z' } } }, now)).toBeNull()
    expect(serviceCompletionBlocker({ fulfilment: { status: 'unfulfilled', booking: null } }, now)).toMatch(/no booked time/)
  })
  it('seller cancel refunds everything paid for the line (tax + shipping), less earlier refunds', () => {
    expect(sellerCancelRefundAmount({ line_total: 1000, tax: 180, shipping_amount: 50 })).toBe(1230)
    expect(sellerCancelRefundAmount({ line_total: 1000, tax: 180, shipping_amount: 50, refunded_amount: 230 })).toBe(1000)
  })
})

describe('W3-10 listing saves: stock deltas, CAS, stable variant ids', () => {
  it('pure: variant ids stay stable; client ids are not trusted', () => {
    let n = 0
    const next = () => `new${++n}`
    const before = [{ id: 'v1', name: 'Small', price: 100, stock: 5 }, { id: 'v2', name: 'Large', price: 200, stock: 5 }]
    const out = stabilizeVariantIds(before, [{ id: '', name: 'large', price: 200, stock: 5 }, { id: 'v1', name: 'Small', price: 100, stock: 5 }, { id: 'evil', name: 'XL', price: 300, stock: 1 }], next)
    expect(out!.map((v) => v.id)).toEqual(['v2', 'v1', 'new1'])
  })
  it('pure: the seller’s change applies as a delta on the current count', () => {
    const p = planStockWrite({ stock: 10 }, { stock: 12 }, { stock: 9 })
    expect(p.stock).toBe(11)
    expect(planStockWrite({ stock: 10 }, { stock: null }, { stock: 9 }).stock).toBeNull()
    expect(planStockWrite({ stock: null }, { stock: 4 }, { stock: null }).stock).toBe(4)
    const v = planStockWrite({ variants: [{ id: 'v1', name: 'S', price: 1, stock: 5 }] }, { variants: [{ id: 'v1', name: 'S', price: 1, stock: 2 }] }, { variants: [{ id: 'v1', name: 'S', price: 1, stock: 1 }] })
    expect(v.variants![0].stock).toBe(0)
  })
  it('a save racing a checkout reservation keeps the reservation', async () => {
    await db.current.collection('mkt_products').insertOne({
      id: 'prod1', seller_id: 's1', kind: 'physical', title: 'Mug', slug: 'mug', description_md: 'A good mug for coffee and tea, sturdy.', images: [], category: 'merch', tags: [],
      currency: 'INR', price: 500, stock: 10, status: 'draft', shipping: { ships_from: 'IN', regions: ['IN'], fee: 0, dispatch_days: 2 }, created_at: 'x', updated_at: 'x',
    })
    const s = seller({ country: 'IN' })
    const edit = { kind: 'physical', title: 'Mug', description_md: 'A good mug for coffee and tea, sturdy.', images: [], category: 'merch', tags: [], currency: 'INR', price: 450, stock: 12, stock_seen: 10, shipping: { ships_from: 'IN', regions: ['IN'], fee: 0, dispatch_days: 2 } }
    await Promise.all([updateProduct(s, 'prod1', edit), takeOne({ product_id: 'prod1', qty: 1 })])
    const p = await db.current.collection('mkt_products').findOne({ id: 'prod1' })
    expect(p).toMatchObject({ stock: 11, price: 450 }) // seller saw 10 and typed 12 (+2); a buyer took 1
    // and the other interleaving (reservation lands after the save's read)
    await Promise.all([takeOne({ product_id: 'prod1', qty: 2 }), updateProduct(s, 'prod1', { ...edit, stock: 20, stock_seen: 11 })])
    expect((await db.current.collection('mkt_products').findOne({ id: 'prod1' }))?.stock).toBe(18)
  })
})

describe('W3-20 purchased digital files are archived, not deleted', () => {
  it('keeps files referenced by sold order lines', async () => {
    await db.current.collection('mkt_files').insertOne({ id: 'f1', seller_id: 's1', name: 'a.pdf', storage: 'db', created_at: 'x' })
    await db.current.collection('mkt_files').insertOne({ id: 'f2', seller_id: 's1', name: 'b.pdf', storage: 'db', created_at: 'x' })
    await seedOrder() // its lines snapshot file f1
    expect(await deleteSellerFiles('s1', ['f1', 'f2'])).toBe(2)
    const files = db.current.collection('mkt_files').docs
    expect(files.map((f) => f.id)).toEqual(['f1'])
    expect(files[0].archived_at).toBeTruthy()
  })
})

describe('GSTIN: full on the buyer tax invoice only', () => {
  it('invoice shows the seller’s full GSTIN; seller views stay masked; PAN never shown', async () => {
    const s = { kyc: { status: 'verified' as const, pan_last4: '234F', gstin: maskGstin('36ABCDE1234F1Z5') }, kyc_secret: await encryptSecret({ pan: 'ABCDE1234F', gstin: '36ABCDE1234F1Z5' }) }
    expect(await sellerInvoiceGstin(s)).toBe('36ABCDE1234F1Z5')
    expect(await sellerInvoiceGstin({ kyc: { status: 'verified' }, kyc_secret: null })).toBeNull()
    expect(publicSeller({ ...seller(), ...s } as SellerDoc).kyc.gstin).toBe('36•••••••••F1Z5')
    const o = await seedOrder()
    const html = buildInvoiceHtml(o as unknown as OrderDoc, { s1: { name: 'Shop', gstin: await sellerInvoiceGstin(s) } }, { name: 'CodeSpectra' })
    expect(html).toContain('GSTIN 36ABCDE1234F1Z5')
    expect(html).not.toContain('PAN')
  })
})
