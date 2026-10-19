/**
 * Marketplace seller/admin part: commission resolution, ledger entries, hold
 * windows and balances, refunds, idempotency, payout guardrails, KYC
 * encryption + masking, product validation per kind, seller order privacy,
 * fulfilment transitions, settings validation, CSV export, file type sniffing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomBytes } from 'node:crypto'
import type { Order, OrderLine } from '@/lib/marketplace/contract'
import { allocate, balancesFromEntries, buildRefundEntries, buildSaleEntries, commissionFor, lineCommission, refundKey, splitLine } from '@/lib/marketplace/ledger'
import { availableAtFor, DEFAULT_SETTINGS, PHYSICAL_TRANSIT_DAYS, validateSettings } from '@/lib/marketplace/settings'
import { nextPayoutStatus, payoutBlocker } from '@/lib/marketplace/payouts'
import { last4, maskGstin, maskTail, maskUpi, nextSellerStatus, openSecret, publicSeller, sealSecret, validateApplication, validatePayout } from '@/lib/marketplace/sellers'
import { contentChanged, validateProduct } from '@/lib/marketplace/listings'
import { allowedFrom, rollupOrderStatus, sellerOrderView } from '@/lib/marketplace/fulfilment'
import { nextProductStatus } from '@/lib/marketplace/moderation'
import { parseRange, toCsv } from '@/lib/marketplace/reports'
import { detectProductFileType } from '@/lib/marketplace/seller-files'
import { isLowStock, marketplaceEmail } from '@/lib/marketplace/seller-notify'
import type { SellerDoc } from '@/lib/marketplace/db'

const DAY = 86_400_000
const SALE = '2026-10-01T00:00:00.000Z'
const iso = (ms: number) => new Date(ms).toISOString()
const t0 = Date.parse(SALE)

function line(over: Partial<OrderLine> = {}): OrderLine {
  const total = over.line_total ?? 10_000
  const bps = over.commission_bps ?? 1500
  const c = Math.floor((total * bps + 5000) / 10_000)
  return {
    id: 'l1', product_id: 'p1', seller_id: 's1', kind: 'digital', title: 'Book', qty: 1, unit_price: total, line_total: total,
    commission_bps: bps, commission_amount: c, seller_earnings: total - c, fulfilment: { status: 'delivered_digital' }, ...over,
  }
}
function order(lines: OrderLine[], over: Partial<Order> = {}): Order {
  const subtotal = lines.reduce((a, l) => a + l.line_total, 0)
  return {
    id: 'o1', number: 'CS-2026-000001', buyer_id: 'b1', buyer_email: 'buyer@example.com', currency: 'INR', lines, subtotal,
    shipping_total: 0, tax_total: 0, discount_total: 0, grand_total: subtotal,
    shipping_address: { name: 'Asha', line1: '1 Main St', city: 'Hyderabad', state: 'TS', postal_code: '500001', country: 'IN', phone: '+919999999999' },
    payment: { gateway: 'phonepe', status: 'succeeded', paid_at: SALE }, status: 'paid', created_at: SALE, updated_at: SALE, ...over,
  }
}
const sum = (xs: { amount: number }[]) => xs.reduce((a, e) => a + e.amount, 0)

describe('commission resolution', () => {
  const settings = { default_commission_bps: 1500, category_commission_bps: { books: 1000, mentoring: 2000 } }
  it('platform seller pays nothing', () => {
    expect(commissionFor({ category: 'books' }, { is_platform: true, commission_bps: 3000 }, settings)).toBe(0)
  })
  it('seller override beats category, category beats default', () => {
    expect(commissionFor({ category: 'books' }, { is_platform: false, commission_bps: 500 }, settings)).toBe(500)
    expect(commissionFor({ category: 'books' }, { is_platform: false, commission_bps: null }, settings)).toBe(1000)
    expect(commissionFor({ category: 'Mentoring' }, { is_platform: false, commission_bps: null }, settings)).toBe(2000)
    expect(commissionFor({ category: 'merch' }, { is_platform: false, commission_bps: null }, settings)).toBe(1500)
  })
  it('a 0% override is honoured and values are clamped to 0..100%', () => {
    expect(commissionFor({ category: 'books' }, { is_platform: false, commission_bps: 0 }, settings)).toBe(0)
    expect(commissionFor({ category: 'x' }, { is_platform: false, commission_bps: 20_000 }, settings)).toBe(10_000)
  })
  it('splits integers with half-up rounding and never loses a paisa', () => {
    expect(splitLine(999, 1500)).toEqual({ commission: 150, earnings: 849 }) // 149.85 → 150
    expect(splitLine(1, 1500)).toEqual({ commission: 0, earnings: 1 })
    const s = splitLine(123_457, 1234)
    expect(s.commission + s.earnings).toBe(123_457)
    expect(() => splitLine(10.5, 1000)).toThrow()
  })
  it('trusts the purchase snapshot only when it adds up', () => {
    expect(lineCommission(line({ line_total: 1000, commission_bps: 1000, commission_amount: 100, seller_earnings: 900 }))).toBe(100)
    expect(lineCommission(line({ line_total: 1000, commission_bps: 1000, commission_amount: 999, seller_earnings: 0 }))).toBe(100)
  })
})

describe('hold windows', () => {
  const s = { hold_days: { digital: 7, physical: 14, service: 3 } }
  it('digital: sale + hold', () => expect(availableAtFor('digital', s, { sale: SALE })).toBe(iso(t0 + 7 * DAY)))
  it('physical: transit allowance before delivery, delivery + hold after', () => {
    expect(availableAtFor('physical', s, { sale: SALE })).toBe(iso(t0 + (PHYSICAL_TRANSIT_DAYS + 14) * DAY))
    expect(availableAtFor('physical', s, { sale: SALE, delivered: iso(t0 + 3 * DAY) })).toBe(iso(t0 + 17 * DAY))
  })
  it('service: from the session end, or completion', () => {
    expect(availableAtFor('service', s, { sale: SALE, session_end: iso(t0 + 10 * DAY) })).toBe(iso(t0 + 13 * DAY))
    expect(availableAtFor('service', s, { sale: SALE, completed: iso(t0 + 2 * DAY) })).toBe(iso(t0 + 5 * DAY))
  })
})

describe('sale entries and balances', () => {
  const settings = DEFAULT_SETTINGS
  it('one sale + commission debit + platform commission per line, all held together', () => {
    const e = buildSaleEntries(order([line()]), settings)
    expect(e.map((x) => [x.type, x.seller_id, x.amount])).toEqual([['sale', 's1', 10_000], ['commission', 's1', -1500], ['commission', null, 1500]])
    expect(new Set(e.map((x) => x.available_at)).size).toBe(1)
    expect(new Set(e.map((x) => x.idem_key)).size).toBe(3)
  })
  it('platform-store line (0%) has no commission entries', () => {
    const e = buildSaleEntries(order([line({ seller_id: 'platform', commission_bps: 0 })]), settings)
    expect(e).toHaveLength(1)
  })
  it('shipping goes to the sellers of physical lines (pro rata), else the platform', () => {
    const o = order([
      line({ id: 'a', seller_id: 'sA', kind: 'physical', line_total: 3000, fulfilment: { status: 'unfulfilled' } }),
      line({ id: 'b', seller_id: 'sB', kind: 'physical', line_total: 1000, fulfilment: { status: 'unfulfilled' } }),
      line({ id: 'c', seller_id: 'sC', kind: 'digital', line_total: 500 }),
    ], { shipping_total: 101 })
    const ship = buildSaleEntries(o, settings).filter((x) => x.type === 'shipping')
    expect(ship.map((x) => [x.seller_id, x.amount])).toEqual([['sA', 75], ['sB', 26]])
    const digitalOnly = buildSaleEntries(order([line()], { shipping_total: 50 }), settings).filter((x) => x.type === 'shipping')
    expect(digitalOnly.map((x) => [x.seller_id, x.amount])).toEqual([[null, 50]])
  })
  it('balances split pending vs available by available_at; debits are immediate', () => {
    const e = buildSaleEntries(order([line()]), settings).filter((x) => x.seller_id === 's1')
    const before = balancesFromEntries(e, new Date(t0 + DAY))
    expect(before).toEqual([{ currency: 'INR', available: 0, pending: 8500, total: 8500 }])
    const after = balancesFromEntries(e, new Date(t0 + 8 * DAY))
    expect(after).toEqual([{ currency: 'INR', available: 8500, pending: 0, total: 8500 }])
    const withPayout = balancesFromEntries([...e, { currency: 'INR', amount: -8500, available_at: iso(t0 + 8 * DAY) }], new Date(t0 + 8 * DAY))
    expect(withPayout[0].available).toBe(0)
  })
  it('rejects bad totals', () => {
    expect(() => buildSaleEntries(order([line({ line_total: -1 })]), settings)).toThrow()
  })
})

describe('refund entries', () => {
  const none = { lines: {}, shipping: {}, shippingPaid: {} }
  it('reverses the seller amount and the proportional commission', () => {
    const o = order([line()])
    const e = buildRefundEntries(o, ['l1'], 4000, none, 'k1', new Date(t0))
    const seller = e.filter((x) => x.seller_id === 's1')
    const platform = e.filter((x) => x.seller_id === null)
    expect(sum(seller)).toBe(-4000 + 600)
    expect(sum(platform)).toBe(-600)
    expect(sum(e)).toBe(-4000)
  })
  it('allocates over lines, caps at what is left, then shipping, then platform (tax)', () => {
    const o = order([
      line({ id: 'a', kind: 'physical', line_total: 6000, fulfilment: { status: 'delivered' } }),
      line({ id: 'b', kind: 'physical', line_total: 4000, fulfilment: { status: 'delivered' } }),
    ], { shipping_total: 500, tax_total: 300 })
    const prior = { lines: { a: 1000 }, shipping: {}, shippingPaid: { s1: 500 } }
    const e = buildRefundEntries(o, ['a', 'b'], 9800, prior, 'k2', new Date(t0))
    const lineRefunds = e.filter((x) => x.type === 'refund' && x.line_id)
    expect(sum(lineRefunds)).toBe(-9000) // a has 5000 left + b 4000
    expect(e.find((x) => x.idem_key.startsWith('refund_shipping'))?.amount).toBe(-500)
    expect(e.find((x) => x.idem_key.startsWith('refund_other'))?.amount).toBe(-300)
  })
  it('refuses lines from another order and non-integer amounts', () => {
    expect(() => buildRefundEntries(order([line()]), ['zz'], 100, none, 'k')).toThrow()
    expect(() => buildRefundEntries(order([line()]), ['l1'], 10.5, none, 'k')).toThrow()
  })
  it('refund keys are stable for replays and distinct for different refunds', () => {
    expect(refundKey(['b', 'a'], 500)).toBe(refundKey(['a', 'b'], 500))
    expect(refundKey(['a'], 500)).not.toBe(refundKey(['a'], 501))
    expect(refundKey(['a'], 500, 'rf_1')).toBe('rf_1')
  })
  it('allocate never exceeds a weight and sums exactly', () => {
    const parts = allocate(10, [3, 3, 4])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10)
    parts.forEach((p, i) => expect(p).toBeLessThanOrEqual([3, 3, 4][i]))
  })
})

// ─── Idempotency against an in-memory ledger (unique idem_key) ───────────────

const store = vi.hoisted(() => ({ ledger: [] as any[] }))
vi.mock('@/lib/marketplace/db', async (orig) => {
  const real = await orig<typeof import('@/lib/marketplace/db')>()
  const ledger = {
    insertOne: async (d: any) => {
      if (store.ledger.some((x) => x.idem_key === d.idem_key)) throw Object.assign(new Error('dup'), { code: 11000 })
      store.ledger.push(d)
    },
    find: (q: any) => ({ toArray: async () => store.ledger.filter((x) => x.order_id === q.order_id && q.type.$in.includes(x.type) && x.seller_id !== null) }),
  }
  return { ...real, ledgerCol: async () => ledger, settingsCol: async () => ({ findOne: async () => null }) }
})
vi.mock('@/lib/marketplace/seller-notify', async (orig) => ({
  ...(await orig<typeof import('@/lib/marketplace/seller-notify')>()),
  onSaleRecorded: vi.fn(async () => {}), notifyAdmins: vi.fn(async () => {}), notifySeller: vi.fn(async () => {}),
}))

describe('ledger idempotency', () => {
  beforeEach(() => { store.ledger.length = 0 })
  it('recordSale twice writes each entry once and notifies once', async () => {
    const { recordSale } = await import('@/lib/marketplace/ledger')
    const notify = (await import('@/lib/marketplace/seller-notify')).onSaleRecorded as ReturnType<typeof vi.fn>
    notify.mockClear()
    const o = order([line(), line({ id: 'l2', seller_id: 's2' })])
    await recordSale(o)
    await recordSale(o)
    expect(store.ledger).toHaveLength(6)
    expect(notify).toHaveBeenCalledTimes(1)
  })
  it('recordSale rejects unpaid orders', async () => {
    const { recordSale } = await import('@/lib/marketplace/ledger')
    await expect(recordSale(order([line()], { status: 'pending_payment', payment: { gateway: 'stripe', status: 'pending' } }))).rejects.toThrow()
  })
  it('recordRefund replay is a no-op; a second refund with its own id is recorded', async () => {
    const { recordRefund } = await import('@/lib/marketplace/ledger')
    const o = order([line()])
    await recordRefund(o, ['l1'], 2000)
    const n = store.ledger.length
    await recordRefund(o, ['l1'], 2000)
    expect(store.ledger.length).toBe(n)
    await recordRefund(o, ['l1'], 2000, { refundId: 'second' })
    expect(store.ledger.length).toBeGreaterThan(n)
    const sellerRefund = store.ledger.filter((x) => x.type === 'refund' && x.seller_id === 's1')
    expect(sum(sellerRefund)).toBe(-4000)
  })
  it('refunds never exceed the line total across separate refunds', async () => {
    const { recordRefund } = await import('@/lib/marketplace/ledger')
    const o = order([line({ line_total: 1000, commission_bps: 0, commission_amount: 0, seller_earnings: 1000 })])
    await recordRefund(o, ['l1'], 800, { refundId: 'r1' })
    await recordRefund(o, ['l1'], 800, { refundId: 'r2' })
    const fromSeller = store.ledger.filter((x) => x.type === 'refund' && x.seller_id === 's1')
    expect(sum(fromSeller)).toBe(-1000)
    expect(store.ledger.find((x) => x.idem_key.startsWith('refund_other'))?.amount).toBe(-600)
  })
})

describe('payout guardrails', () => {
  const seller = { status: 'approved' as const, payout: { method: 'bank' as const, verified: true } }
  it('allows within available and above the minimum', () => {
    expect(payoutBlocker({ seller, amount: 100_000, available: 150_000, min: 100_000 })).toBeNull()
  })
  it('blocks over-available, under-minimum, unverified, unapproved and non-integer amounts', () => {
    expect(payoutBlocker({ seller, amount: 150_001, available: 150_000, min: 100 })).toMatch(/more than/)
    expect(payoutBlocker({ seller, amount: 99, available: 150_000, min: 100 })).toMatch(/minimum/)
    expect(payoutBlocker({ seller: { ...seller, payout: { method: 'bank', verified: false } }, amount: 500, available: 900, min: 100 })).toMatch(/verification/)
    expect(payoutBlocker({ seller: { ...seller, status: 'suspended' }, amount: 500, available: 900, min: 100 })).toMatch(/approved/)
    expect(payoutBlocker({ seller: { ...seller, payout: { method: null, verified: false } }, amount: 500, available: 900, min: 100 })).toMatch(/payout method/)
    expect(payoutBlocker({ seller, amount: 10.5, available: 900, min: 1 })).toMatch(/amount/)
    expect(payoutBlocker({ seller, amount: 0, available: 0, min: 0 })).toMatch(/amount/)
  })
  it('state machine: request → approve → paid; failures and cancels only from open states', () => {
    expect(nextPayoutStatus('requested', 'approve')).toBe('approved')
    expect(nextPayoutStatus('approved', 'paid')).toBe('paid')
    expect(nextPayoutStatus('requested', 'paid')).toBeNull()
    expect(nextPayoutStatus('paid', 'failed')).toBeNull()
    expect(nextPayoutStatus('approved', 'cancel')).toBeNull()
    expect(nextPayoutStatus('requested', 'cancel')).toBe('cancelled')
  })
})

describe('KYC encryption and masking', () => {
  const key = new Uint8Array(randomBytes(32))
  it('round-trips with the key and fails closed with another', () => {
    const box = sealSecret(key, { pan: 'ABCDE1234F' })
    expect(box).not.toContain('ABCDE1234F')
    expect(openSecret<{ pan: string }>(key, box)?.pan).toBe('ABCDE1234F')
    expect(openSecret(new Uint8Array(randomBytes(32)), box)).toBeNull()
    expect(openSecret(key, null)).toBeNull()
  })
  it('masks to the last four', () => {
    expect(last4('ABCDE1234F')).toBe('234F')
    expect(maskTail('123456789012')).toBe('••••••••9012')
    expect(maskTail('12')).toBe('••')
    expect(maskUpi('asha.k@okhdfc')).toBe('as••••@okhdfc')
  })
  it('publicSeller never returns secrets', () => {
    const doc = { id: 's', kyc_secret: 'v1.x', payout_secret: 'v1.y', stripe_account_id: 'acct_1', reviewed_by: 'admin', display_name: 'S' } as unknown as SellerDoc
    const p = publicSeller(doc) as unknown as Record<string, unknown>
    expect(p.kyc_secret).toBeUndefined()
    expect(p.payout_secret).toBeUndefined()
    expect(p.stripe_account_id).toBeUndefined()
    expect(p.stripe_connected).toBe(true)
  })
  it('masks GSTIN to state code + last 4 (idempotent), including legacy plain values in publicSeller', () => {
    expect(maskGstin('36ABCDE1234F1Z5')).toBe('36•••••••••F1Z5')
    expect(maskGstin(maskGstin('36ABCDE1234F1Z5'))).toBe('36•••••••••F1Z5')
    expect(maskGstin('')).toBe('')
    const legacy = { id: 's', display_name: 'S', kyc: { status: 'verified', gstin: '36ABCDE1234F1Z5' } } as unknown as SellerDoc
    expect(JSON.stringify(publicSeller(legacy))).not.toContain('ABCDE1234F')
    expect(publicSeller(legacy).kyc.gstin).toBe('36•••••••••F1Z5')
  })
  const base = { display_name: 'Asha Books', country: 'IN', accept_terms: true, contact_email: 'a@x.com' }
  it('India: PAN required, only last 4 public, GSTIN must embed the PAN', () => {
    const ok = validateApplication({ ...base, kyc: { pan: 'abcde1234f', gstin: '36ABCDE1234F1Z5' }, payout: { method: 'upi', upi: 'asha@okhdfc' } }, { stripeConfigured: false })
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.value.kyc_public.pan_last4).toBe('234F')
      expect((ok.value.kyc_public as Record<string, unknown>).pan).toBeUndefined()
      expect(ok.value.kyc_secret.pan).toBe('ABCDE1234F')
      expect(ok.value.account_ref).not.toContain('asha@')
      // GSTIN embeds the PAN: public copy is state code + last 4, full value only in the sealed secret.
      expect(ok.value.kyc_public.gstin).toBe('36•••••••••F1Z5')
      expect(JSON.stringify(ok.value.kyc_public)).not.toContain('ABCDE1234F')
      expect(ok.value.kyc_secret.gstin).toBe('36ABCDE1234F1Z5')
    }
    const mismatch = validateApplication({ ...base, kyc: { pan: 'ABCDE1234F', gstin: '36ZZZZZ9999Z1Z5' }, payout: { method: 'upi', upi: 'a@ok' } }, { stripeConfigured: false })
    expect(mismatch.ok).toBe(false)
    expect(validateApplication({ ...base, kyc: { pan: '1234' }, payout: { method: 'upi', upi: 'asha@okhdfc' } }, { stripeConfigured: false }).ok).toBe(false)
  })
  it('US: 9-digit tax id + W-9 acknowledgement; Stripe only when configured', () => {
    const us = { ...base, country: 'US', kyc: { tax_id: '12-3456789', w9_acknowledged: true } }
    const ok = validateApplication({ ...us, payout: { method: 'bank', account_name: 'Asha', account_no: '000123456', routing_no: '021000021' } }, { stripeConfigured: false })
    expect(ok.ok && ok.value.kyc_public.tax_id_last4).toBe('6789')
    expect(validateApplication({ ...us, kyc: { tax_id: '123456789' }, payout: { method: 'bank', account_name: 'A', account_no: '1234', routing_no: '021000021' } }, { stripeConfigured: false }).ok).toBe(false)
    expect(validateApplication({ ...us, payout: { method: 'stripe_connect' } }, { stripeConfigured: false }).ok).toBe(false)
    expect(validateApplication({ ...us, payout: { method: 'stripe_connect' } }, { stripeConfigured: true }).ok).toBe(true)
  })
  it('bank details: IFSC and account formats; terms required', () => {
    expect(validatePayout('IN', { method: 'bank', account_name: 'Asha', account_no: '123456789012', ifsc: 'HDFC0001234' }, { stripeConfigured: false }).ok).toBe(true)
    expect(validatePayout('IN', { method: 'bank', account_name: 'Asha', account_no: '12', ifsc: 'HDFC1234' }, { stripeConfigured: false }).ok).toBe(false)
    expect(validatePayout('US', { method: 'upi', upi: 'a@ok' }, { stripeConfigured: false }).ok).toBe(false)
    expect(validateApplication({ ...base, accept_terms: false, kyc: { pan: 'ABCDE1234F' }, payout: { method: 'upi', upi: 'asha@okhdfc' } }, { stripeConfigured: false }).ok).toBe(false)
  })
  it('seller status transitions', () => {
    expect(nextSellerStatus('pending', 'approve')).toBe('approved')
    expect(nextSellerStatus('approved', 'reject')).toBeNull()
    expect(nextSellerStatus('approved', 'suspend')).toBe('suspended')
    expect(nextSellerStatus('suspended', 'reinstate')).toBe('approved')
  })
})

describe('product validation per kind', () => {
  const common = { title: 'Clean code notes', description_md: 'A concise guide to writing clean code.', category: 'ebooks', currency: 'INR', price: 49_900 }
  it('digital: files must be the seller’s own; strict needs at least one', () => {
    expect(validateProduct({ ...common, kind: 'digital', digital: { file_ids: ['f1'] } }, { ownFileIds: ['f1'], strict: true }).ok).toBe(true)
    expect(validateProduct({ ...common, kind: 'digital', digital: { file_ids: ['other'] } }, { ownFileIds: ['f1'] }).ok).toBe(false)
    expect(validateProduct({ ...common, kind: 'digital', digital: { file_ids: [] } }, { strict: true, ownFileIds: [] }).ok).toBe(false)
  })
  it('physical: shipping required, variants set the from-price, stock ≥ 0', () => {
    const ship = { ships_from: 'IN', regions: 'IN, US', fee: 5000, dispatch_days: 2 }
    const v = validateProduct({ ...common, kind: 'physical', category: 'merch', shipping: ship, variants: [{ name: 'M', price: 59_900, stock: 3 }, { name: 'L', price: 69_900, stock: 0 }] }, { newId: () => 'vid' })
    expect(v.ok).toBe(true)
    if (v.ok) { expect(v.value.price).toBe(59_900); expect(v.value.shipping?.regions).toEqual(['IN', 'US']); expect(v.value.stock).toBeNull() }
    expect(validateProduct({ ...common, kind: 'physical', category: 'merch' }).ok).toBe(false)
    expect(validateProduct({ ...common, kind: 'physical', category: 'merch', shipping: ship, stock: -1 }).ok).toBe(false)
    expect(validateProduct({ ...common, kind: 'physical', category: 'merch', shipping: ship, variants: [{ name: 'M' }, { name: 'm' }] }).ok).toBe(false)
  })
  it('service: duration, valid time zone, ordered weekly windows', () => {
    const svc = { duration_min: 45, mode: 'virtual', provider: 'zoom', timezone: 'Asia/Kolkata', weekly: [{ dow: 1, start: '10:00', end: '12:00' }] }
    expect(validateProduct({ ...common, kind: 'service', category: 'mentoring', service: svc }, { strict: true }).ok).toBe(true)
    expect(validateProduct({ ...common, kind: 'service', category: 'mentoring', service: { ...svc, timezone: 'Mars/Base' } }).ok).toBe(false)
    expect(validateProduct({ ...common, kind: 'service', category: 'mentoring', service: { ...svc, weekly: [{ dow: 1, start: '12:00', end: '10:00' }] } }).ok).toBe(false)
    expect(validateProduct({ ...common, kind: 'service', category: 'mentoring', service: { ...svc, duration_min: 5 } }).ok).toBe(false)
  })
  it('common: integer minor-unit price, known category, compare-at above price', () => {
    expect(validateProduct({ ...common, kind: 'digital', price: 499.5 }).ok).toBe(false)
    expect(validateProduct({ ...common, kind: 'digital', category: 'weapons' }).ok).toBe(false)
    expect(validateProduct({ ...common, kind: 'digital', compare_at_price: 100 }).ok).toBe(false)
    expect(validateProduct({ ...common, kind: 'digital', images: ['javascript:alert(1)'] }).ok).toBe(false)
  })
  it('price-only edits do not need re-review; content edits do', () => {
    const a = validateProduct({ ...common, kind: 'digital' })
    const b = validateProduct({ ...common, kind: 'digital', price: 59_900 })
    const c = validateProduct({ ...common, kind: 'digital', title: 'New title here' })
    if (!a.ok || !b.ok || !c.ok) throw new Error('setup')
    expect(contentChanged(a.value, b.value)).toBe(false)
    expect(contentChanged(a.value, c.value)).toBe(true)
  })
  it('moderation transitions', () => {
    expect(nextProductStatus('pending_review', 'approve')).toBe('published')
    expect(nextProductStatus('draft', 'approve')).toBeNull()
    expect(nextProductStatus('published', 'unpublish')).toBe('rejected')
  })
})

describe('seller order view and fulfilment', () => {
  const o = order([
    line({ id: 'mine', seller_id: 's1', kind: 'physical', fulfilment: { status: 'unfulfilled' } }),
    line({ id: 'theirs', seller_id: 's2', kind: 'digital' }),
  ])
  it('shows only the seller’s own lines and contact while fulfilment is open', () => {
    const v = sellerOrderView(o, 's1')!
    expect(v.lines.map((l) => l.id)).toEqual(['mine'])
    expect(v.shipping_address?.name).toBe('Asha')
    expect(v.buyer_email).toBe('buyer@example.com')
    expect(sellerOrderView(o, 's3')).toBeNull()
  })
  it('hides buyer contact once delivered, and from digital-only sellers', () => {
    const done = order([line({ id: 'mine', seller_id: 's1', kind: 'physical', fulfilment: { status: 'delivered' } })])
    expect(sellerOrderView(done, 's1')!.shipping_address).toBeNull()
    expect(sellerOrderView(done, 's1')!.buyer_email).toBeNull()
    expect(sellerOrderView(o, 's2')!.buyer_email).toBeNull()
  })
  it('line transitions by kind', () => {
    expect(allowedFrom('physical', 'shipped')).toEqual(['unfulfilled', 'processing'])
    expect(allowedFrom('physical', 'delivered')).toEqual(['shipped'])
    expect(allowedFrom('digital', 'shipped')).toEqual([])
    expect(allowedFrom('service', 'completed')).toContain('booked')
  })
  it('order status rolls up from lines', () => {
    expect(rollupOrderStatus(o)).toBe('partially_fulfilled')
    expect(rollupOrderStatus({ ...o, lines: o.lines.map((l) => ({ ...l, fulfilment: { status: 'delivered' } })) })).toBe('fulfilled')
    expect(rollupOrderStatus({ ...o, status: 'refunded' })).toBe('refunded')
  })
  it('low stock: any tracked variant at or below the threshold', () => {
    expect(isLowStock({ kind: 'physical', stock: 3, variants: undefined, low_stock_threshold: null })).toBe(true)
    expect(isLowStock({ kind: 'physical', stock: null, variants: undefined, low_stock_threshold: null })).toBe(false)
    expect(isLowStock({ kind: 'physical', stock: null, variants: [{ id: 'a', name: 'A', price: 1, stock: 10 }, { id: 'b', name: 'B', price: 1, stock: 1 }], low_stock_threshold: 2 })).toBe(true)
    expect(isLowStock({ kind: 'digital', stock: 0, variants: undefined, low_stock_threshold: null })).toBe(false)
  })
})

describe('settings, reports, files, email', () => {
  it('validates settings', () => {
    const ok = validateSettings({ ...DEFAULT_SETTINGS, category_commission_bps: { Books: '1000' } })
    expect(ok.ok && ok.value.category_commission_bps).toEqual({ books: 1000 })
    expect(validateSettings({ ...DEFAULT_SETTINGS, default_commission_bps: 12_000 }).ok).toBe(false)
    expect(validateSettings({ ...DEFAULT_SETTINGS, hold_days: { digital: -1, physical: 1, service: 1 } }).ok).toBe(false)
    expect(validateSettings({ ...DEFAULT_SETTINGS, min_payout: { INR: 10.5, USD: 1 } }).ok).toBe(false)
  })
  it('CSV escapes quotes and neutralises formulas', () => {
    const csv = toCsv([{ a: 'x,"y"', b: '=HYPERLINK("x")', c: -150 }])
    expect(csv.split('\r\n')[1]).toBe('"x,""y""","\'=HYPERLINK(""x"")",-150')
  })
  it('report range defaults to the last 30 days and includes the whole end day', () => {
    const r = parseRange('2026-10-01', '2026-10-01')
    expect(r.from).toBe('2026-10-01T00:00:00.000Z')
    expect(r.to).toBe('2026-10-01T23:59:59.999Z')
    const d = parseRange(null, null, new Date(SALE))
    expect(Date.parse(d.to) - Date.parse(d.from)).toBe(30 * DAY)
  })
  it('sniffs file types by magic bytes, not just the extension', () => {
    expect(detectProductFileType('a.pdf', Buffer.from('%PDF-1.7 ...'))).toBe('application/pdf')
    expect(detectProductFileType('a.pdf', Buffer.from('MZ\x90\x00'))).toBeNull()
    expect(detectProductFileType('a.epub', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]))).toBe('application/epub+zip')
    expect(detectProductFileType('a.exe', Buffer.from('MZ'))).toBeNull()
    expect(detectProductFileType('notes.md', Buffer.from('# hi\0there'))).toBeNull()
    expect(detectProductFileType('notes.md', Buffer.from('# hi'))).toBe('text/markdown')
  })
  it('every marketplace email carries an unsubscribe link and escapes content', () => {
    const m = marketplaceEmail('New order <b>', 'Hi <script>', '/dashboard/seller')
    expect(m.html).toMatch(/Unsubscribe or manage email notifications/)
    expect(m.html).not.toContain('<script>')
  })
})
