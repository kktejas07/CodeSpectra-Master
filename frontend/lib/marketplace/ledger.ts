/**
 * Marketplace money ledger (append-only, integer minor units).
 *
 * Seller balance = Σ amount per (seller, currency). An entry counts as
 * "available" once `available_at` ≤ now, "pending" before. Credits from a sale
 * are held for the kind's refund window (settings.availableAtFor); debits
 * (refunds, payouts) are effective immediately, so available funds are never
 * overstated. Every write carries a unique `idem_key`, so replays (webhook
 * retries, double clicks) are no-ops.
 *
 * Per order line (seller S, total T, commission C):
 *   sale                 S   +T   held
 *   commission           S   −C   held   (same release time as the sale)
 *   commission           ∅   +C   held   (platform revenue, seller_id null)
 * Shipping (per line, excluding its tax) goes to that line's seller (no commission).
 * A refund of p on a line reverses p from the seller and the proportional
 * commission from the platform.
 *
 * The only mutation of an existing entry is `available_at` (rescheduleLineHold —
 * delivery / service completion re-times the hold); amounts never change.
 */
import { createHash } from 'node:crypto'
import type { Currency, ItemKind, LedgerEntry, MarketplaceSettings, Order, OrderLine, Product, Seller } from './contract'
import type { LedgerDoc } from './db'
import { MAX_BPS, MktError, availableAtFor } from './settings'

// ─── Commission ──────────────────────────────────────────────────────────────

/** Commission in bps: platform seller 0 → seller override → category override → default. */
export function commissionFor(
  product: Pick<Product, 'category'>,
  seller: Pick<Seller, 'is_platform' | 'commission_bps'>,
  settings: Pick<MarketplaceSettings, 'default_commission_bps' | 'category_commission_bps'>,
): number {
  const clamp = (n: number) => Math.min(MAX_BPS, Math.max(0, Math.round(n)))
  if (seller.is_platform) return 0
  if (typeof seller.commission_bps === 'number' && Number.isFinite(seller.commission_bps)) return clamp(seller.commission_bps)
  const cat = settings.category_commission_bps?.[String(product.category || '').toLowerCase()]
  if (typeof cat === 'number' && Number.isFinite(cat)) return clamp(cat)
  return clamp(settings.default_commission_bps)
}

/** Split a line total into commission + seller earnings (commission rounded half-up). */
export function splitLine(lineTotal: number, bps: number): { commission: number; earnings: number } {
  if (!Number.isInteger(lineTotal) || lineTotal < 0) throw new MktError(400, 'Line total must be a non-negative integer')
  const commission = Math.floor((lineTotal * bps + 5000) / 10_000)
  return { commission, earnings: lineTotal - commission }
}

/** The line's commission, trusting the purchase snapshot only when it adds up. */
export function lineCommission(line: Pick<OrderLine, 'line_total' | 'commission_bps' | 'commission_amount' | 'seller_earnings'>): number {
  const c = line.commission_amount
  if (Number.isInteger(c) && c >= 0 && c <= line.line_total && c + line.seller_earnings === line.line_total) return c
  return splitLine(line.line_total, Math.min(MAX_BPS, Math.max(0, line.commission_bps || 0))).commission
}

// ─── Pure entry builders ─────────────────────────────────────────────────────

type NewEntry = Omit<LedgerDoc, 'id' | 'created_at'>

/** Allocate `amount` over weights (integer, remainder to the last; never exceeds a weight when Σweights ≥ amount). */
export function allocate(amount: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0)
  if (!total || amount <= 0) return weights.map(() => 0)
  const out = weights.map((w) => Math.floor((amount * w) / total))
  let rest = amount - out.reduce((a, b) => a + b, 0)
  for (let i = weights.length - 1; i >= 0 && rest > 0; i--) {
    const room = weights[i] - out[i]
    const add = Math.min(room, rest)
    out[i] += add
    rest -= add
  }
  return out
}

export function buildSaleEntries(order: Order, settings: Pick<MarketplaceSettings, 'hold_days'>): NewEntry[] {
  const sale = order.payment?.paid_at || order.created_at
  const entries: NewEntry[] = []
  const physicalBySeller = new Map<string, { weight: number; available_at: string }>()
  for (const line of order.lines) {
    if (!Number.isInteger(line.line_total) || line.line_total < 0) throw new MktError(400, `Line ${line.id} has an invalid total`)
    const available_at = availableAtFor(line.kind, settings, {
      sale,
      delivered: line.fulfilment?.delivered_at ?? null,
      session_end: line.fulfilment?.booking?.end ?? null,
    })
    const c = lineCommission(line)
    const base = { order_id: order.id, line_id: line.id, currency: order.currency, available_at, kind: line.kind }
    entries.push({ ...base, idem_key: `sale:${order.id}:${line.id}`, seller_id: line.seller_id, type: 'sale', amount: line.line_total, note: line.title?.slice(0, 120) })
    if (c > 0) {
      entries.push({ ...base, idem_key: `commission:${order.id}:${line.id}`, seller_id: line.seller_id, type: 'commission', amount: -c, note: `${line.commission_bps / 100}% commission` })
      entries.push({ ...base, idem_key: `platform_commission:${order.id}:${line.id}`, seller_id: null, type: 'commission', amount: c })
    }
    if (line.kind === 'physical') {
      const cur = physicalBySeller.get(line.seller_id)
      physicalBySeller.set(line.seller_id, { weight: (cur?.weight ?? 0) + Math.max(1, line.line_total), available_at: cur && cur.available_at > available_at ? cur.available_at : available_at })
    }
  }
  // Shipping credited to sellers is each line's shipping EXCLUDING tax (pricing puts the shipping
  // tax in tax_total, which the platform remits). Orders from before per-line shipping existed
  // fall back to splitting shipping_total.
  const perLine = order.lines.some((l) => typeof (l as { shipping_amount?: number }).shipping_amount === 'number')
  if (perLine) {
    const bySeller = new Map<string, number>()
    for (const l of order.lines) {
      const amt = Math.max(0, Math.round((l as { shipping_amount?: number }).shipping_amount || 0))
      if (amt > 0) bySeller.set(l.seller_id, (bySeller.get(l.seller_id) || 0) + amt)
    }
    for (const [sid, amt] of bySeller) {
      const at = physicalBySeller.get(sid)?.available_at ?? new Date(sale).toISOString()
      entries.push({ order_id: order.id, line_id: null, seller_id: sid, currency: order.currency, type: 'shipping', amount: amt, available_at: at, idem_key: `shipping:${order.id}:${sid}`, kind: 'physical' })
    }
    return entries
  }
  const ship = Math.max(0, order.shipping_total || 0)
  if (ship > 0) {
    const sellers = [...physicalBySeller.entries()]
    if (!sellers.length) {
      entries.push({ order_id: order.id, line_id: null, seller_id: null, currency: order.currency, type: 'shipping', amount: ship, available_at: new Date(sale).toISOString(), idem_key: `shipping:${order.id}:platform` })
    } else {
      const parts = allocate(ship, sellers.map(([, v]) => v.weight))
      sellers.forEach(([sid, v], i) => {
        if (parts[i] > 0) entries.push({ order_id: order.id, line_id: null, seller_id: sid, currency: order.currency, type: 'shipping', amount: parts[i], available_at: v.available_at, idem_key: `shipping:${order.id}:${sid}`, kind: 'physical' })
      })
    }
  }
  return entries
}

/** Stable refund key: the caller's refund id, else the (lines, amount) tuple. */
export function refundKey(lineIds: string[], amount: number, refundId?: string | null): string {
  if (refundId) return String(refundId).slice(0, 80)
  return createHash('sha256').update(`${[...lineIds].sort().join(',')}|${amount}`).digest('hex').slice(0, 16)
}

/**
 * Pure: entries for refunding `amount` over `lineIds`.
 * `prior` = previously refunded amount per line id and per seller's shipping.
 * Excess beyond line + shipping balances (tax etc.) is booked against the platform.
 */
export function buildRefundEntries(
  order: Order,
  lineIds: string[],
  amount: number,
  prior: { lines: Record<string, number>; shipping: Record<string, number>; shippingPaid: Record<string, number> },
  key: string,
  now: Date = new Date(),
): NewEntry[] {
  if (!Number.isInteger(amount) || amount <= 0) throw new MktError(400, 'Refund amount must be a positive whole number of minor units')
  const ids = [...new Set(lineIds)]
  const lines = ids.map((id) => order.lines.find((l) => l.id === id))
  if (!ids.length || lines.some((l) => !l)) throw new MktError(400, 'Refund lines must belong to the order')
  const sel = lines as OrderLine[]
  const room = sel.map((l) => Math.max(0, l.line_total - (prior.lines[l.id] || 0)))
  const totalRoom = room.reduce((a, b) => a + b, 0)
  const at = now.toISOString()
  const base = { order_id: order.id, currency: order.currency, available_at: at }
  const parts = allocate(Math.min(amount, totalRoom), room)
  const entries: NewEntry[] = []
  sel.forEach((l, i) => {
    const p = parts[i]
    if (!p) return
    const c = l.line_total ? Math.floor((p * lineCommission(l) + Math.floor(l.line_total / 2)) / l.line_total) : 0
    entries.push({ ...base, line_id: l.id, seller_id: l.seller_id, type: 'refund', amount: -p, idem_key: `refund:${order.id}:${l.id}:${key}`, kind: l.kind })
    if (c > 0) {
      entries.push({ ...base, line_id: l.id, seller_id: l.seller_id, type: 'commission', amount: c, idem_key: `refund_commission:${order.id}:${l.id}:${key}`, note: 'Commission returned on refund' })
      entries.push({ ...base, line_id: l.id, seller_id: null, type: 'commission', amount: -c, idem_key: `refund_platform_commission:${order.id}:${l.id}:${key}`, note: 'Commission reversed on refund' })
    }
  })
  let rest = amount - parts.reduce((a, b) => a + b, 0)
  // Shipping back from the sellers of the refunded physical lines.
  for (const sid of [...new Set(sel.filter((l) => l.kind === 'physical').map((l) => l.seller_id))]) {
    if (rest <= 0) break
    const left = Math.max(0, (prior.shippingPaid[sid] || 0) - (prior.shipping[sid] || 0))
    const x = Math.min(left, rest)
    if (x > 0) {
      entries.push({ ...base, line_id: null, seller_id: sid, type: 'refund', amount: -x, idem_key: `refund_shipping:${order.id}:${sid}:${key}`, note: 'Shipping refunded' })
      rest -= x
    }
  }
  if (rest > 0) entries.push({ ...base, line_id: null, seller_id: null, type: 'refund', amount: -rest, idem_key: `refund_other:${order.id}:${key}`, note: 'Tax / other refunded by the platform' })
  return entries
}

export interface Balance { currency: Currency; available: number; pending: number; total: number }

/** Pure: balances per currency from entries. */
export function balancesFromEntries(entries: Pick<LedgerEntry, 'currency' | 'amount' | 'available_at'>[], now: Date = new Date()): Balance[] {
  const t = now.toISOString()
  const m = new Map<Currency, Balance>()
  for (const e of entries) {
    const b = m.get(e.currency) ?? { currency: e.currency, available: 0, pending: 0, total: 0 }
    if (e.available_at <= t) b.available += e.amount
    else b.pending += e.amount
    b.total += e.amount
    m.set(e.currency, b)
  }
  return [...m.values()].sort((a, b) => a.currency.localeCompare(b.currency))
}

// ─── DB ──────────────────────────────────────────────────────────────────────

const isDup = (e: unknown) => (e as { code?: number })?.code === 11000

/** Insert entries one by one; duplicates (same idem_key) are skipped. Returns the inserted ones. */
export async function insertEntries(entries: NewEntry[]): Promise<LedgerDoc[]> {
  const { ledgerCol, newId, nowIso } = await import('./db')
  const col = await ledgerCol()
  const inserted: LedgerDoc[] = []
  for (const e of entries) {
    const doc: LedgerDoc = { ...e, id: newId(), created_at: nowIso() }
    try {
      await col.insertOne(doc)
      inserted.push(doc)
    } catch (err) {
      if (!isDup(err)) throw err
    }
  }
  return inserted
}

/** On payment success (buyer part): sale + commission entries per line. Idempotent per order/line. */
export async function recordSale(order: Order): Promise<void> {
  const paid = order.payment?.status === 'succeeded' || ['paid', 'partially_fulfilled', 'fulfilled'].includes(order.status)
  if (!paid) throw new MktError(409, 'Only paid orders can be recorded as sales')
  const { getSettings } = await import('./settings')
  // Service holds run from the session end: the slot is held at checkout, so the booking knows it.
  let o = order
  if (order.lines.some((l) => l.kind === 'service' && !l.fulfilment?.booking?.end)) {
    const { bookingsCol } = await import('./db')
    const rows = await (await bookingsCol()).find({ order_id: order.id }, { projection: { _id: 0, line_id: 1, start: 1, end: 1 } }).toArray()
    const byLine = new Map(rows.map((r) => [r.line_id, r]))
    o = { ...order, lines: order.lines.map((l) => {
      const b = l.kind === 'service' && !l.fulfilment?.booking?.end ? byLine.get(l.id) : null
      return b ? { ...l, fulfilment: { ...l.fulfilment, booking: { start: b.start, end: b.end } } } : l
    }) }
  }
  const inserted = await insertEntries(buildSaleEntries(o, await getSettings()))
  const newLines = new Set(inserted.filter((e) => e.type === 'sale' && e.line_id).map((e) => e.line_id as string))
  if (newLines.size) {
    const { onSaleRecorded } = await import('./seller-notify')
    await onSaleRecorded(order, [...newLines]).catch((e) => console.error('[marketplace] sale notify failed', (e as Error)?.message))
  }
}

/** Prior refunds on the order, ignoring this refund's own entries (so a replay / resumed write rebuilds the same split). */
async function priorRefunds(orderId: string, key: string) {
  const { ledgerCol } = await import('./db')
  const all = await (await ledgerCol()).find({ order_id: orderId, type: { $in: ['refund', 'shipping'] }, seller_id: { $ne: null } }, { projection: { _id: 0, type: 1, line_id: 1, seller_id: 1, amount: 1, idem_key: 1 } }).toArray()
  const rows = all.filter((r) => !r.idem_key.endsWith(`:${key}`))
  const lines: Record<string, number> = {}
  const shipping: Record<string, number> = {}
  const shippingPaid: Record<string, number> = {}
  for (const r of rows) {
    const sid = r.seller_id as string
    if (r.type === 'shipping') shippingPaid[sid] = (shippingPaid[sid] || 0) + r.amount
    else if (r.line_id) lines[r.line_id] = (lines[r.line_id] || 0) - r.amount
    else shipping[sid] = (shipping[sid] || 0) - r.amount
  }
  return { lines, shipping, shippingPaid }
}

/**
 * Refund `amount` (minor units) over `lineIds`. Idempotent (and resumable): replaying the same
 * (lines, amount) — or the same `opts.refundId` — records nothing new. Two
 * genuinely separate refunds of the same amount on the same lines need distinct refundIds.
 */
export async function recordRefund(order: Order, lineIds: string[], amount: number, opts: { refundId?: string | null } = {}): Promise<void> {
  const key = refundKey(lineIds, amount, opts.refundId)
  await insertEntries(buildRefundEntries(order, lineIds, amount, await priorRefunds(order.id, key), key))
}

/** Re-time the hold of a line's sale/commission entries (delivery, service completion, cancellation). */
export async function rescheduleLineHold(orderId: string, lineId: string, availableAt: string): Promise<void> {
  const { ledgerCol } = await import('./db')
  const col = await ledgerCol()
  await col.updateMany({ order_id: orderId, line_id: lineId, type: { $in: ['sale', 'commission'] } }, { $set: { available_at: availableAt } })
  // Shipping for that seller follows the latest of its physical lines; keep it simple: same time.
  const line = await col.findOne({ order_id: orderId, line_id: lineId, type: 'sale' }, { projection: { seller_id: 1, kind: 1 } })
  if (line?.kind === 'physical' && line.seller_id) {
    await col.updateOne({ idem_key: `shipping:${orderId}:${line.seller_id}`, available_at: { $lt: availableAt } }, { $set: { available_at: availableAt } })
  }
}

export async function balancesFor(sellerId: string | null, now: Date = new Date()): Promise<Balance[]> {
  const { ledgerCol } = await import('./db')
  const t = now.toISOString()
  const rows = await (await ledgerCol()).aggregate<{ _id: Currency; available: number; pending: number }>([
    { $match: { seller_id: sellerId } },
    { $group: {
      _id: '$currency',
      available: { $sum: { $cond: [{ $lte: ['$available_at', t] }, '$amount', 0] } },
      pending: { $sum: { $cond: [{ $gt: ['$available_at', t] }, '$amount', 0] } },
    } },
  ]).toArray()
  return rows.map((r) => ({ currency: r._id, available: r.available, pending: r.pending, total: r.available + r.pending })).sort((a, b) => a.currency.localeCompare(b.currency))
}

export async function availableFor(sellerId: string, currency: Currency, now?: Date): Promise<number> {
  return (await balancesFor(sellerId, now)).find((b) => b.currency === currency)?.available ?? 0
}

export async function listEntries(sellerId: string | null, opts: { limit?: number; before?: string | null; currency?: Currency | null } = {}): Promise<LedgerDoc[]> {
  const { ledgerCol } = await import('./db')
  const q: Record<string, unknown> = { seller_id: sellerId }
  if (opts.currency) q.currency = opts.currency
  if (opts.before) q.created_at = { $lt: opts.before }
  return (await ledgerCol()).find(q, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(Math.min(200, opts.limit ?? 50)).toArray()
}

export type { ItemKind }
