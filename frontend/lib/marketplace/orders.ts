/**
 * Buyer orders: list / detail view, cancel, refund & return requests, and the refund
 * executor (gateway refund → recordRefund → order update → e-mail). Admin-approved refund
 * requests (moderation.decideRefund) call refundLines directly so they move real money.
 */
import 'server-only'
import type { FulfilmentStatus, OrderStatus } from './contract'
import { filesCol, newId, nowIso, refundsCol, reviewsCol, type RefundRequestDoc } from './db'
import { orders, type OrderDoc, type OrderLineDoc } from './order-doc'
import { gatewayRefund } from './gateways'
import { recordRefund } from './ledger'
import { getSettings } from './settings'
import { allocateProRata, linePaid } from './pricing'
import { cancelEligibility, canReview, refundEligibility, type Eligibility } from './rules'
import { giveBack } from './stock'
import { bookings, releaseBookings } from './booking'
import { abandonOrder } from './settle'
import { sendRefundProcessed } from './emails'
import { downloadsLeft } from './download-token'
import { CartError } from './cart'

// ─── Reads ───────────────────────────────────────────────────────────────────

export interface BuyerOrderSummary {
  id: string; number: string; status: OrderStatus; currency: OrderDoc['currency']; grand_total: number; created_at: string
  items: number; first_title: string; image: string | null
}

export async function listBuyerOrders(userId: string, opts: { before?: string | null; limit?: number } = {}): Promise<BuyerOrderSummary[]> {
  const q: Record<string, unknown> = { buyer_id: userId }
  if (opts.before) q.created_at = { $lt: opts.before }
  const rows = await (await orders()).find(q as never, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(Math.min(100, opts.limit ?? 30)).toArray()
  return rows.map((o) => ({
    id: o.id, number: o.number, status: o.status, currency: o.currency, grand_total: o.grand_total, created_at: o.created_at,
    items: o.lines.reduce((a, l) => a + l.qty, 0), first_title: o.lines[0]?.title ?? '', image: o.lines[0]?.image ?? null,
  }))
}

export async function getBuyerOrder(userId: string, orderId: string): Promise<OrderDoc | null> {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(orderId)) return null
  return (await orders()).findOne({ id: orderId, buyer_id: userId }, { projection: { _id: 0 } })
}

export interface BuyerLineView {
  id: string; product_id: string; slug?: string; title: string; image: string | null; kind: OrderLineDoc['kind']; qty: number
  variant_name: string | null; unit_price: number; paid: number; refunded_amount: number
  status: FulfilmentStatus; seller_id: string
  tracking: { carrier?: string; tracking_no?: string; tracking_url?: string; shipped_at?: string; delivered_at?: string } | null
  booking: { start: string; end: string; join_url: string | null; mode: string; timezone: string } | null
  files: { id: string; name: string; size: number }[]
  downloads_used: number; downloads_left: number | null
  can_cancel: boolean; refund: Eligibility; can_review: boolean; reviewed: boolean
}

export interface BuyerOrderView {
  id: string; number: string; status: OrderStatus; currency: OrderDoc['currency']; created_at: string
  subtotal: number; discount_total: number; shipping_total: number; tax_total: number; grand_total: number
  tax_bps: number; prices_include_tax: boolean
  payment: { gateway: string; status: string; paid_at?: string; refunded_total: number }
  shipping_address: OrderDoc['shipping_address']; contact_phone: string | null
  coupon: string | null
  lines: BuyerLineView[]
  refunds: Pick<RefundRequestDoc, 'id' | 'line_ids' | 'amount' | 'type' | 'status' | 'reason' | 'note' | 'created_at'>[]
  reservation_expires_at: string | null
}

export async function buyerOrderView(order: OrderDoc): Promise<BuyerOrderView> {
  const settings = await getSettings()
  const now = Date.now()
  const fileIds = order.lines.flatMap((l) => l.digital?.file_ids || [])
  const [files, bks, refunds, reviews] = await Promise.all([
    fileIds.length ? (await filesCol()).find({ id: { $in: fileIds } }, { projection: { _id: 0, id: 1, name: 1, size: 1 } }).toArray() : Promise.resolve([]),
    (await bookings()).find({ order_id: order.id }, { projection: { _id: 0 } }).toArray(),
    (await refundsCol()).find({ order_id: order.id }, { projection: { _id: 0 } }).sort({ created_at: -1 }).toArray(),
    (await reviewsCol()).find({ order_id: order.id, user_id: order.buyer_id }, { projection: { _id: 0, product_id: 1 } }).toArray(),
  ])
  const fileMap = new Map(files.map((f) => [f.id, f]))
  const reviewed = new Set(reviews.map((r) => r.product_id))
  const openRefundLines = new Set(refunds.filter((r) => r.status === 'open' || r.status === 'approved').flatMap((r) => r.line_ids))
  const lines: BuyerLineView[] = order.lines.map((l) => {
    const b = bks.find((x) => x.line_id === l.id && x.status !== 'cancelled')
    const paidLike = order.status !== 'pending_payment' && order.status !== 'cancelled'
    const delivered = l.kind === 'digital' && l.fulfilment.status === 'delivered_digital' && !(l.refunded_amount ?? 0)
    const refund = openRefundLines.has(l.id) ? { ok: false as const, reason: 'A refund request is already open for this item.' } : refundEligibility(order, l, settings, now)
    return {
      id: l.id, product_id: l.product_id, slug: l.slug, title: l.title, image: l.image ?? null, kind: l.kind, qty: l.qty,
      variant_name: l.variant_name ?? null, unit_price: l.unit_price, paid: linePaid(l), refunded_amount: l.refunded_amount ?? 0,
      status: l.fulfilment.status, seller_id: l.seller_id,
      tracking: l.kind === 'physical' && (l.fulfilment.tracking_no || l.fulfilment.shipped_at)
        ? { carrier: l.fulfilment.carrier, tracking_no: l.fulfilment.tracking_no, tracking_url: l.fulfilment.tracking_url, shipped_at: l.fulfilment.shipped_at, delivered_at: l.fulfilment.delivered_at }
        : null,
      booking: l.kind === 'service' && (b || l.fulfilment.booking)
        ? { start: b?.start ?? l.fulfilment.booking!.start, end: b?.end ?? l.fulfilment.booking!.end, join_url: paidLike ? (b?.join_url || l.fulfilment.booking?.join_url || null) : null, mode: l.service?.mode ?? 'virtual', timezone: l.service?.timezone ?? 'UTC' }
        : null,
      files: delivered ? (l.digital?.file_ids || []).map((id) => fileMap.get(id)).filter((f): f is NonNullable<typeof f> => !!f).map((f) => ({ id: f.id, name: f.name, size: f.size })) : [],
      downloads_used: l.fulfilment.downloads_used ?? 0,
      downloads_left: l.kind === 'digital' ? (Number.isFinite(downloadsLeft(l.fulfilment.downloads_used ?? 0, l.digital?.download_limit)) ? downloadsLeft(l.fulfilment.downloads_used ?? 0, l.digital?.download_limit) : null) : null,
      can_cancel: !openRefundLines.has(l.id) && cancelEligibility(order, l, now).ok,
      refund,
      can_review: canReview(order, l, now) && !reviewed.has(l.product_id),
      reviewed: reviewed.has(l.product_id),
    }
  })
  return {
    id: order.id, number: order.number, status: order.status, currency: order.currency, created_at: order.created_at,
    subtotal: order.subtotal, discount_total: order.discount_total, shipping_total: order.shipping_total, tax_total: order.tax_total, grand_total: order.grand_total,
    tax_bps: order.tax_bps ?? 0, prices_include_tax: order.prices_include_tax !== false,
    payment: { gateway: order.payment.gateway, status: order.payment.status, paid_at: order.payment.paid_at, refunded_total: order.payment.refunded_total ?? 0 },
    shipping_address: order.shipping_address ?? null, contact_phone: order.contact_phone ?? null, coupon: order.coupon?.code ?? null,
    lines,
    refunds: refunds.map((r) => ({ id: r.id, line_ids: r.line_ids, amount: r.amount, type: r.type, status: r.status, reason: r.reason, note: r.note, created_at: r.created_at })),
    reservation_expires_at: order.status === 'pending_payment' ? order.reservation?.expires_at ?? null : null,
  }
}

// ─── Refund executor ─────────────────────────────────────────────────────────

/** A refund claimed this long ago without a gateway answer is treated as crashed and retried (same idempotency key). */
export const STALE_REFUND_CLAIM_MS = 10 * 60_000

export type RefundPhase = 'claimed' | 'gateway' | 'done'

/** Pure: phase of a `post.refund_<id>` marker ("claimed|<iso>", "gateway|<iso>", "done|<iso>"; a bare ISO time = legacy done). */
export function refundPhase(v: string | null | undefined): { phase: RefundPhase; at: string } | null {
  if (!v) return null
  const i = v.indexOf('|')
  if (i < 0) return { phase: 'done', at: v }
  const p = v.slice(0, i)
  return { phase: p === 'claimed' || p === 'gateway' ? p : 'done', at: v.slice(i + 1) }
}

const markerOf = (refundId: string) => `refund_${refundId.replace(/[^A-Za-z0-9_-]/g, '')}`

/**
 * Atomic claim filter: every line still unrefunded and unlocked (and, for buyer-initiated refunds of
 * digital items, never downloaded), and the order's refunded total stays within what was paid.
 */
export function refundClaimFilter(orderId: string, lines: Pick<OrderLineDoc, 'id' | 'kind'>[], amount: number, marker: string, requireNotDownloaded: boolean): Record<string, unknown> {
  return {
    id: orderId,
    [`post.${marker}`]: { $exists: false },
    $and: [
      ...lines.map((l) => ({ lines: { $elemMatch: {
        id: l.id,
        refund_lock: { $exists: false },
        refunded_amount: { $in: [0, null] },
        ...(requireNotDownloaded && l.kind === 'digital' ? { 'fulfilment.download_claimed': { $exists: false }, 'fulfilment.downloads_used': { $in: [0, null] } } : {}),
      } } })),
      { $expr: { $lte: [{ $add: [{ $ifNull: ['$payment.refunded_total', 0] }, amount] }, '$grand_total'] } },
    ],
  }
}

/**
 * Refund `amount` for `lineIds` through the gateway, then ledger + order.
 *
 *  1. Claim (one atomic update): marker `claimed`, a refund_lock on every line, and
 *     payment.refunded_total += amount guarded by refunded_total + amount ≤ grand_total. Two
 *     parallel refunds of the same line can't both pass, whatever their refund ids.
 *  2. Gateway refund (idempotency key = refundId). A failure rolls the claim back.
 *  3. Marker → `gateway`; then the idempotent steps (ledger idem keys, line updates conditional on
 *     the line still being unrefunded, one-shot restock flags, booking release, totals) and marker →
 *     `done`. A retry with the same refundId resumes at step 3, so a crash after the gateway call
 *     never leaves the buyer refunded but the ledger / order untouched.
 */
export async function refundLines(orderId: string, lineIds: string[], amount: number, refundId: string, opts: { reason: string; restock: boolean; requireNotDownloaded?: boolean }): Promise<void> {
  const col = await orders()
  const order = await col.findOne({ id: orderId }, { projection: { _id: 0 } })
  if (!order) throw new CartError(404, 'Order not found')
  const marker = markerOf(refundId)
  const markerPath = `post.${marker}`
  const state = refundPhase(order.post?.[marker])
  // A resumed refund uses exactly what was claimed, whatever the caller recomputed.
  const meta = order.refunds_meta?.[marker]
  if (state && meta) { amount = meta.amount; lineIds = meta.line_ids }
  const ids = [...new Set(lineIds)]
  const lines = order.lines.filter((l) => ids.includes(l.id))
  if (!lines.length || lines.length !== ids.length) throw new CartError(400, 'Unknown items')
  if (!Number.isInteger(amount) || amount < 0) throw new CartError(400, 'Refund amount is more than what is left to refund.')

  if (!state) {
    if (amount > order.grand_total - (order.payment.refunded_total ?? 0)) throw new CartError(400, 'Refund amount is more than what is left to refund.')
    const claimedAt = `claimed|${nowIso()}`
    const claim = await col.updateOne(
      refundClaimFilter(orderId, lines, amount, marker, !!opts.requireNotDownloaded) as never,
      { $set: { [markerPath]: claimedAt, [`refunds_meta.${marker}`]: { amount, line_ids: ids }, 'lines.$[r].refund_lock': refundId, updated_at: nowIso() }, $inc: { 'payment.refunded_total': amount } } as never,
      { arrayFilters: [{ 'r.id': { $in: ids } }] } as never,
    )
    if (!claim.modifiedCount) {
      const fresh = await col.findOne({ id: orderId }, { projection: { _id: 0 } })
      if (fresh?.post?.[marker]) return refundLines(orderId, ids, amount, refundId, opts) // same refund raced us: resume / report
      throw new CartError(409, 'A refund for this item is already in progress or done, or the item was downloaded.')
    }
    await sendToGateway(order, ids, amount, refundId, marker, claimedAt)
  } else if (state.phase === 'claimed') {
    // Another call is talking to the gateway right now — or crashed doing so (then retry, same key).
    if (Date.now() - Date.parse(state.at) < STALE_REFUND_CLAIM_MS) throw new CartError(409, 'This refund is already being processed. Try again in a few minutes.')
    await sendToGateway(order, ids, amount, refundId, marker, order.post![marker])
  } else if (state.phase === 'done') {
    return
  }
  await finishRefund(orderId, ids, amount, refundId, marker, opts)
}

async function sendToGateway(order: OrderDoc, ids: string[], amount: number, refundId: string, marker: string, claimedValue: string): Promise<void> {
  const col = await orders()
  const markerPath = `post.${marker}`
  let ok = false
  try {
    ok = (await gatewayRefund(order, amount, refundId)).ok
  } catch {
    ok = false
  }
  if (!ok) {
    // ponytail: any gateway error releases the claim; the gateway idempotency key (refundId)
    // still dedupes a retry of the same refund. Reconciling a timed-out-but-executed refund
    // issued under a different id is left to the admin (gateway dashboard).
    await col.updateOne(
      { id: order.id, [markerPath]: claimedValue } as never,
      { $unset: { [markerPath]: '', [`refunds_meta.${marker}`]: '', 'lines.$[r].refund_lock': '' }, $inc: { 'payment.refunded_total': -amount }, $set: { updated_at: nowIso() } } as never,
      { arrayFilters: [{ 'r.id': { $in: ids }, 'r.refund_lock': refundId }] } as never,
    )
    throw new CartError(502, 'The refund could not be sent to the payment provider. Please try again or contact support.')
  }
  await col.updateOne({ id: order.id, [markerPath]: claimedValue } as never, { $set: { [markerPath]: `gateway|${nowIso()}` } } as never)
}

/** Steps after a successful gateway refund — every one idempotent, safe to re-run. */
async function finishRefund(orderId: string, ids: string[], amount: number, refundId: string, marker: string, opts: { reason: string; restock: boolean }): Promise<void> {
  const col = await orders()
  const markerPath = `post.${marker}`
  const order = (await col.findOne({ id: orderId }, { projection: { _id: 0 } }))!
  const lines = order.lines.filter((l) => ids.includes(l.id))
  await recordRefund(order, ids, amount, { refundId })

  const shares = allocateProRata(amount, lines.map((l) => Math.max(1, linePaid(l))))
  const now = nowIso()
  for (const [i, l] of lines.entries()) {
    const before = l.fulfilment.status
    const status: FulfilmentStatus = l.kind === 'physical' && (before === 'shipped' || before === 'delivered') ? 'returned' : 'cancelled'
    const restock = opts.restock && l.kind === 'physical' && (before === 'unfulfilled' || before === 'processing')
    // Applied once: only while this refund holds the line, it isn't marked refunded yet and its
    // status is still the one we decided from.
    await col.updateOne(
      { id: orderId, lines: { $elemMatch: { id: l.id, refund_lock: refundId, refunded_amount: { $in: [0, null] }, 'fulfilment.status': before } } } as never,
      { $set: { 'lines.$.fulfilment.status': status, 'lines.$.refunded_amount': shares[i], ...(restock ? { 'lines.$.restock_pending': true } : {}), updated_at: now } } as never,
    )
  }
  for (const l of lines.filter((x) => x.kind === 'physical')) {
    const take = await col.updateOne({ id: orderId, lines: { $elemMatch: { id: l.id, restock_pending: true } } } as never, { $unset: { 'lines.$.restock_pending': '' } } as never)
    if (take.modifiedCount) await giveBack({ product_id: l.product_id, variant_id: l.variant_id ?? null, qty: l.qty })
  }
  const services = lines.filter((l) => l.kind === 'service').map((l) => l.id)
  if (services.length) await releaseBookings(orderId, services)
  const fresh = (await col.findOne({ id: orderId }, { projection: { _id: 0 } }))!
  const refunded = fresh.payment.refunded_total ?? 0
  const full = refunded >= fresh.grand_total
  await col.updateOne({ id: orderId }, { $set: {
    'payment.status': full ? 'refunded' : 'partially_refunded',
    ...(full ? { status: 'refunded' as OrderStatus } : {}),
    updated_at: now,
  } } as never)
  const done = await col.updateOne({ id: orderId, [markerPath]: { $regex: '^gateway\\|' } } as never, { $set: { [markerPath]: `done|${now}` } } as never)
  if (!done.modifiedCount) return // another call finished it (and told the buyer)
  if (amount > 0) await sendRefundProcessed(order, amount, lines)
  const { notify } = await import('@/lib/notifications')
  await notify({ user_id: order.buyer_id, type: 'mkt.refund_processed', title: 'Refund processed', message: `Refund for order ${order.number} is on its way.`, link: `/dashboard/orders/${order.id}`, icon: 'credit-card' }).catch(() => null)
}


// ─── Buyer actions ───────────────────────────────────────────────────────────

async function refundNow(order: OrderDoc, lines: OrderLineDoc[], reason: string, type: RefundRequestDoc['type']): Promise<void> {
  const amount = lines.reduce((a, l) => a + linePaid(l), 0)
  const now = nowIso()
  const bySeller = new Map<string, OrderLineDoc[]>()
  for (const l of lines) bySeller.set(l.seller_id, [...(bySeller.get(l.seller_id) || []), l])
  // One refund record (admin trail) per seller; one gateway refund for the lot.
  const refundId = newId()
  const docs: RefundRequestDoc[] = [...bySeller.entries()].map(([sid, ls]) => ({
    id: bySeller.size === 1 ? refundId : newId(), order_id: order.id, buyer_id: order.buyer_id, seller_id: sid, line_ids: ls.map((l) => l.id).sort(),
    currency: order.currency, amount: ls.reduce((a, l) => a + linePaid(l), 0), reason, type, status: 'approved', decided_by: 'system', decided_at: now, note: 'Automatic (within policy)', created_at: now, updated_at: now,
  }))
  const col = await refundsCol()
  await col.insertMany(docs)
  try {
    // Buyer-initiated: a digital item must still be undownloaded at claim time (atomic with downloads).
    await refundLines(order.id, lines.map((l) => l.id), amount, refundId, { reason, restock: true, requireNotDownloaded: true })
    await col.updateMany({ id: { $in: docs.map((d) => d.id) } }, { $set: { status: 'refunded', updated_at: nowIso() } })
  } catch (e) {
    if (e instanceof CartError && e.status === 409) {
      // Lost the race (another refund / a download got there first): nothing was refunded.
      await col.deleteMany({ id: { $in: docs.map((d) => d.id) } })
      throw e
    }
    await col.updateMany({ id: { $in: docs.map((d) => d.id) } }, { $set: { status: 'open', note: 'Automatic refund failed — waiting for review', updated_at: nowIso() } })
    throw e
  }
}

function pickLines(order: OrderDoc, lineIds: unknown): OrderLineDoc[] {
  const ids = Array.isArray(lineIds) ? lineIds.filter((x): x is string => typeof x === 'string').slice(0, 50) : []
  const lines = ids.length ? order.lines.filter((l) => ids.includes(l.id)) : order.lines
  if (!lines.length || (ids.length && lines.length !== new Set(ids).size)) throw new CartError(400, 'Choose the items to cancel.')
  return lines
}

export async function cancelByBuyer(userId: string, orderId: string, lineIds?: unknown): Promise<'released' | 'refunded'> {
  const order = await getBuyerOrder(userId, orderId)
  if (!order) throw new CartError(404, 'Order not found')
  if (order.status === 'pending_payment') {
    await abandonOrder(order.id, 'cancelled_by_buyer')
    return 'released'
  }
  const lines = pickLines(order, lineIds)
  for (const l of lines) {
    const e = cancelEligibility(order, l)
    if (!e.ok) throw new CartError(409, `${l.title}: ${e.reason}`)
  }
  await refundNow(order, lines, 'Cancelled by the buyer', 'refund')
  return 'refunded'
}

export async function requestRefund(userId: string, orderId: string, lineIds: unknown, reasonRaw: unknown): Promise<{ refunded: string[]; requested: string[] }> {
  const order = await getBuyerOrder(userId, orderId)
  if (!order) throw new CartError(404, 'Order not found')
  const reason = typeof reasonRaw === 'string' ? reasonRaw.trim().slice(0, 1000) : ''
  if (reason.length < 5) throw new CartError(400, 'Tell us briefly why (at least 5 characters).')
  const lines = pickLines(order, lineIds)
  const open = await (await refundsCol()).find({ order_id: order.id, status: { $in: ['open', 'approved'] } }, { projection: { _id: 0, line_ids: 1 } }).toArray()
  const busy = new Set(open.flatMap((r) => r.line_ids))
  const settings = await getSettings()
  const auto: OrderLineDoc[] = []
  const review: OrderLineDoc[] = []
  for (const l of lines) {
    if (busy.has(l.id)) throw new CartError(409, `${l.title}: a request is already open.`)
    const e = refundEligibility(order, l, settings)
    if (!e.ok) throw new CartError(409, `${l.title}: ${e.reason}`)
    ;(e.mode === 'auto' ? auto : review).push(l)
  }
  if (auto.length) await refundNow(order, auto, reason, 'refund')
  if (review.length) {
    const { openRefundRequest } = await import('./fulfilment')
    const bySeller = new Map<string, OrderLineDoc[]>()
    for (const l of review) bySeller.set(l.seller_id, [...(bySeller.get(l.seller_id) || []), l])
    for (const [sid, ls] of bySeller) {
      await openRefundRequest({ order, sellerId: sid, lineIds: ls.map((l) => l.id), amount: ls.reduce((a, l) => a + linePaid(l), 0), reason, type: 'return', openedBy: userId })
    }
  }
  return { refunded: auto.map((l) => l.id), requested: review.map((l) => l.id) }
}
