/**
 * Seller-side fulfilment: the seller's slice of each order (only their lines;
 * buyer contact only while something of theirs still needs fulfilling),
 * line status changes (physical: processing → shipped → delivered; services:
 * completed / cancelled), bookings, refund requests, and the overview numbers.
 */
import type { FulfilmentStatus, ItemKind, Order, OrderLine, OrderStatus } from './contract'
import type { RefundRequestDoc, SellerDoc } from './db'
import { MktError } from './settings'
import { linePaid } from './pricing'

export type LineAction = 'processing' | 'shipped' | 'delivered' | 'completed' | 'cancelled'

const FLOW: Record<ItemKind, Partial<Record<LineAction, FulfilmentStatus[]>>> = {
  physical: { processing: ['unfulfilled'], shipped: ['unfulfilled', 'processing'], delivered: ['shipped'], cancelled: ['unfulfilled', 'processing'] },
  service: { completed: ['unfulfilled', 'booked'], cancelled: ['unfulfilled', 'booked'] },
  digital: {},
}

/** Pure: allowed from-states for an action on a line kind (empty = not allowed). */
export function allowedFrom(kind: ItemKind, action: LineAction): FulfilmentStatus[] {
  return FLOW[kind]?.[action] ?? []
}

/**
 * Pure: why a service line can't be marked completed yet (null = ok). A session is complete only
 * once its booked end time has passed — marking it earlier would end the buyer's cancel / refund
 * rights and start the seller's payout hold before anything was delivered.
 */
export function serviceCompletionBlocker(line: Pick<OrderLine, 'fulfilment'>, now = Date.now()): string | null {
  const end = Date.parse(line.fulfilment?.booking?.end || '')
  if (!Number.isFinite(end)) return 'This session has no booked time yet.'
  if (now < end) return 'You can mark a session completed after it has ended.'
  return null
}

/** Pure: what the buyer gets back when the seller cancels a line — everything paid for it (net + shipping + tax), less earlier refunds. */
export function sellerCancelRefundAmount(line: { line_total: number; shipping_amount?: number; tax?: number; refunded_amount?: number }): number {
  return Math.max(0, linePaid(line) - (line.refunded_amount ?? 0))
}

const OPEN: FulfilmentStatus[] = ['unfulfilled', 'processing', 'shipped', 'booked']
const DONE: FulfilmentStatus[] = ['delivered', 'delivered_digital', 'completed', 'cancelled', 'returned']

export function needsAction(l: Pick<OrderLine, 'kind' | 'fulfilment'>): boolean {
  return (l.kind === 'physical' || l.kind === 'service') && OPEN.includes(l.fulfilment?.status ?? 'unfulfilled')
}

/** Pure: order status from its lines (only while the order is in a fulfilment state). */
export function rollupOrderStatus(order: Pick<Order, 'status' | 'lines'>): OrderStatus {
  if (!['paid', 'partially_fulfilled', 'fulfilled'].includes(order.status)) return order.status
  const done = order.lines.filter((l) => DONE.includes(l.fulfilment?.status ?? 'unfulfilled')).length
  if (done === order.lines.length) return 'fulfilled'
  return done > 0 ? 'partially_fulfilled' : 'paid'
}

export interface SellerOrderView {
  id: string
  number: string
  created_at: string
  status: OrderStatus
  currency: Order['currency']
  lines: OrderLine[]
  my_total: number
  my_earnings: number
  buyer_email: string | null
  shipping_address: Order['shipping_address'] | null
}

/** Pure: the seller's view of an order — never another seller's lines; contact only while needed. */
export function sellerOrderView(order: Order, sellerId: string): SellerOrderView | null {
  const lines = order.lines.filter((l) => l.seller_id === sellerId)
  if (!lines.length) return null
  const open = lines.filter(needsAction)
  const physOpen = open.some((l) => l.kind === 'physical')
  return {
    id: order.id,
    number: order.number,
    created_at: order.created_at,
    status: order.status,
    currency: order.currency,
    lines,
    my_total: lines.reduce((a, l) => a + l.line_total, 0),
    my_earnings: lines.reduce((a, l) => a + l.seller_earnings, 0),
    buyer_email: open.length ? order.buyer_email : null,
    shipping_address: physOpen ? order.shipping_address ?? null : null,
  }
}

const FULFIL_STATES: OrderStatus[] = ['paid', 'partially_fulfilled', 'fulfilled', 'partially_refunded', 'refunded', 'cancelled']

export async function listSellerOrders(sellerId: string, opts: { open?: boolean; limit?: number; before?: string | null } = {}): Promise<SellerOrderView[]> {
  const { ordersCol } = await import('./db')
  const q: Record<string, unknown> = { 'lines.seller_id': sellerId, status: { $in: FULFIL_STATES } }
  if (opts.open) {
    q.status = { $in: ['paid', 'partially_fulfilled'] }
    q.lines = { $elemMatch: { seller_id: sellerId, kind: { $in: ['physical', 'service'] }, 'fulfilment.status': { $in: OPEN } } }
  }
  if (opts.before) q.created_at = { $lt: opts.before }
  const rows = await (await ordersCol()).find(q, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(Math.min(200, opts.limit ?? 50)).toArray()
  return rows.map((o) => sellerOrderView(o, sellerId)).filter((v): v is SellerOrderView => !!v)
}

export async function updateLine(
  seller: SellerDoc,
  orderId: string,
  lineId: string,
  action: LineAction,
  input: { carrier?: string; tracking_no?: string; tracking_url?: string; reason?: string } = {},
): Promise<SellerOrderView> {
  const { ordersCol, nowIso } = await import('./db')
  const col = await ordersCol()
  const order = await col.findOne({ id: orderId, 'lines.seller_id': seller.id }, { projection: { _id: 0 } })
  const line = order?.lines.find((l) => l.id === lineId && l.seller_id === seller.id)
  if (!order || !line) throw new MktError(404, 'Order not found')
  if (!['paid', 'partially_fulfilled'].includes(order.status)) throw new MktError(409, `This order is ${order.status.replace('_', ' ')} — it can't be updated.`)
  const from = allowedFrom(line.kind, action)
  const cur = line.fulfilment?.status ?? 'unfulfilled'
  if (!from.includes(cur)) throw new MktError(409, `Can't mark a ${cur.replace('_', ' ')} ${line.kind} item as ${action}.`)
  if (line.kind === 'service' && action === 'completed') {
    // The booking record is authoritative for the session time (the line snapshot may lag).
    const { bookingsCol } = await import('./db')
    const b = await (await bookingsCol()).findOne({ order_id: orderId, line_id: lineId, status: { $in: ['held', 'booked', 'completed'] } }, { projection: { _id: 0, start: 1, end: 1 } })
    const block = serviceCompletionBlocker(b ? { fulfilment: { ...line.fulfilment, booking: { start: b.start, end: b.end } } } : line)
    if (block) throw new MktError(409, block)
  }
  const now = nowIso()
  const set: Record<string, unknown> = { 'lines.$.fulfilment.status': action, updated_at: now }
  if (action === 'shipped') {
    const carrier = String(input.carrier || '').trim().slice(0, 60)
    const tracking_no = String(input.tracking_no || '').trim().slice(0, 80)
    const tracking_url = String(input.tracking_url || '').trim().slice(0, 500)
    if (carrier.length < 2 || tracking_no.length < 3) throw new MktError(400, 'Enter the carrier and tracking number.')
    if (tracking_url && !/^https:\/\/[^\s<>"']+$/.test(tracking_url)) throw new MktError(400, 'Tracking link must start with https://')
    Object.assign(set, { 'lines.$.fulfilment.carrier': carrier, 'lines.$.fulfilment.tracking_no': tracking_no, 'lines.$.fulfilment.tracking_url': tracking_url || null, 'lines.$.fulfilment.shipped_at': now })
  }
  if (action === 'delivered') set['lines.$.fulfilment.delivered_at'] = now
  const r = await col.updateOne({ id: orderId, lines: { $elemMatch: { id: lineId, seller_id: seller.id, 'fulfilment.status': cur } } }, { $set: set })
  if (!r.modifiedCount) throw new MktError(409, 'This order was just updated — reload and try again.')
  const fresh = (await col.findOne({ id: orderId }, { projection: { _id: 0 } })) as Order
  const status = rollupOrderStatus(fresh)
  if (status !== fresh.status) await col.updateOne({ id: orderId, status: fresh.status }, { $set: { status, updated_at: now } })

  const { getSettings, availableAtFor } = await import('./settings')
  const { rescheduleLineHold } = await import('./ledger')
  const settings = await getSettings()
  if (action === 'delivered') await rescheduleLineHold(orderId, lineId, availableAtFor('physical', settings, { sale: order.created_at, delivered: now }))
  if (action === 'completed') await rescheduleLineHold(orderId, lineId, availableAtFor('service', settings, { sale: order.created_at, completed: now }))
  if (line.kind === 'service' && action === 'completed') {
    const { bookingsCol } = await import('./db')
    await (await bookingsCol()).updateMany({ order_id: orderId, line_id: lineId, status: { $in: ['held', 'booked'] } }, { $set: { status: 'completed', updated_at: now } })
  }
  if (line.kind === 'service' && action === 'cancelled') {
    const { releaseBookings } = await import('./booking') // frees the slot (buyer part)
    await releaseBookings(orderId, [lineId])
  }
  if (line.kind === 'physical' && action === 'cancelled') {
    const { giveBack } = await import('./stock')
    await giveBack({ product_id: line.product_id, variant_id: line.variant_id ?? null, qty: line.qty }).catch((e) => console.error('[marketplace] restock failed', (e as Error)?.message))
  }
  if (action === 'cancelled') {
    await openRefundRequest({ order: fresh, sellerId: seller.id, lineIds: [lineId], amount: sellerCancelRefundAmount(line as Parameters<typeof sellerCancelRefundAmount>[0]), reason: String(input.reason || 'Cancelled by the seller').slice(0, 500), type: 'refund', openedBy: seller.user_id })
  }
  const { notify } = await import('@/lib/notifications')
  const words: Record<LineAction, string> = { processing: 'is being prepared', shipped: 'has shipped', delivered: 'was delivered', completed: 'is complete', cancelled: 'was cancelled by the seller — a refund is on its way' }
  await notify({ user_id: order.buyer_id, type: 'mkt.order_update', title: `Order ${order.number} update`, message: `${line.title.slice(0, 80)} ${words[action]}.`, link: `/dashboard/orders/${order.id}` }).catch(() => null)
  if (action === 'shipped') {
    const shipped = fresh.lines.find((l) => l.id === lineId)
    if (shipped) {
      const { sendShippedEmail } = await import('./emails')
      await sendShippedEmail(fresh as never, shipped as never).catch((e) => console.error('[marketplace] shipped email failed', (e as Error)?.message))
      const { emit } = await import('@/lib/automation/events')
      void emit('marketplace.order.shipped', {
        order_id: order.id, line_id: lineId, seller_id: seller.id, buyer_id: order.buyer_id, buyer_email: order.buyer_email,
        carrier: shipped.fulfilment?.carrier ?? null, tracking_url: shipped.fulfilment?.tracking_url ?? null,
      }, { idempotencyKey: `marketplace.order.shipped:${order.id}:${lineId}` })
    }
  }
  return sellerOrderView(fresh, seller.id) as SellerOrderView
}

/** Refund / return request (seller cancellation here; the buyer part may insert its own). Idempotent per (order, lines). */
export async function openRefundRequest(p: { order: Order; sellerId: string; lineIds: string[]; amount: number; reason: string; type: RefundRequestDoc['type']; openedBy: string }): Promise<void> {
  const { refundsCol, newId, nowIso } = await import('./db')
  const col = await refundsCol()
  const lineIds = [...p.lineIds].sort()
  if (await col.findOne({ order_id: p.order.id, line_ids: lineIds, status: { $in: ['open', 'approved'] } }, { projection: { _id: 1 } })) return
  const now = nowIso()
  await col.insertOne({ id: newId(), order_id: p.order.id, buyer_id: p.order.buyer_id, seller_id: p.sellerId, line_ids: lineIds, currency: p.order.currency, amount: p.amount, reason: p.reason, type: p.type, status: 'open', created_at: now, updated_at: now })
  const { notifyAdmins } = await import('./seller-notify')
  await notifyAdmins('mkt.refund_requested', 'Refund request', `Order ${p.order.number}: ${p.reason.slice(0, 120)}`, '/dashboard/admin/marketplace?tab=refunds')
}

export async function listSellerRefunds(sellerId: string): Promise<RefundRequestDoc[]> {
  const { refundsCol } = await import('./db')
  return (await refundsCol()).find({ seller_id: sellerId }, { projection: { _id: 0, buyer_id: 0 } }).sort({ created_at: -1 }).limit(200).toArray() as Promise<RefundRequestDoc[]>
}

export async function listSellerBookings(sellerId: string, opts: { upcoming?: boolean } = {}) {
  const { bookingsCol } = await import('./db')
  const q: Record<string, unknown> = { seller_id: sellerId }
  if (opts.upcoming) q.start = { $gte: new Date(Date.now() - 86_400_000).toISOString() }
  return (await bookingsCol()).find(q, { projection: { _id: 0, buyer_id: 0 } }).sort({ start: opts.upcoming ? 1 : -1 }).limit(200).toArray()
}

export async function sellerOverview(seller: SellerDoc) {
  const { ordersCol, productsCol, refundsCol, ledgerCol } = await import('./db')
  const { balancesFor } = await import('./ledger')
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const [balances, toFulfil, productCounts, openRefunds, sales30] = await Promise.all([
    balancesFor(seller.id),
    (await ordersCol()).countDocuments({ status: { $in: ['paid', 'partially_fulfilled'] }, lines: { $elemMatch: { seller_id: seller.id, kind: { $in: ['physical', 'service'] }, 'fulfilment.status': { $in: OPEN } } } }),
    (await productsCol()).aggregate<{ _id: string; n: number }>([{ $match: { seller_id: seller.id } }, { $group: { _id: '$status', n: { $sum: 1 } } }]).toArray(),
    (await refundsCol()).countDocuments({ seller_id: seller.id, status: 'open' }),
    (await ledgerCol()).aggregate<{ _id: string; total: number; count: number }>([
      { $match: { seller_id: seller.id, type: 'sale', created_at: { $gte: since } } },
      { $group: { _id: '$currency', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]).toArray(),
  ])
  return {
    balances,
    to_fulfil: toFulfil,
    products: Object.fromEntries(productCounts.map((r) => [r._id, r.n])),
    open_refunds: openRefunds,
    sales_30d: sales30.map((r) => ({ currency: r._id, total: r.total, count: r.count })),
  }
}
