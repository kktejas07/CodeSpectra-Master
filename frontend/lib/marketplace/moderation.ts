/**
 * Admin (superadmin) marketplace operations: seller list, product moderation,
 * all-orders view, refund / dispute decisions. Payouts live in payouts.ts,
 * reports in reports.ts.
 */
import type { Order, Product } from './contract'
import type { ProductDoc, RefundRequestDoc, SellerDoc } from './db'
import { MktError } from './settings'

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export async function listSellersAdmin(opts: { status?: string | null; q?: string | null } = {}) {
  const { sellersCol } = await import('./db')
  const { publicSeller } = await import('./sellers')
  const filter: Record<string, unknown> = {}
  if (opts.status) filter.status = opts.status
  if (opts.q) filter.$or = [{ display_name: { $regex: esc(opts.q.slice(0, 60)), $options: 'i' } }, { slug: { $regex: esc(opts.q.slice(0, 60)), $options: 'i' } }]
  const rows = await (await sellersCol()).find(filter, { projection: { _id: 0 } }).sort({ is_platform: -1, created_at: -1 }).limit(500).toArray()
  return rows.map((s: SellerDoc) => publicSeller(s))
}

export async function listProductsAdmin(opts: { status?: string | null; sellerId?: string | null } = {}) {
  const { productsCol } = await import('./db')
  const q: Record<string, unknown> = {}
  if (opts.status) q.status = opts.status
  if (opts.sellerId) q.seller_id = opts.sellerId
  return (await productsCol()).find(q, { projection: { _id: 0 } }).sort({ submitted_at: 1, updated_at: -1 }).limit(500).toArray()
}

export type ProductDecision = 'approve' | 'reject' | 'unpublish'

export function nextProductStatus(current: Product['status'], d: ProductDecision): Product['status'] | null {
  if (d === 'approve') return current === 'pending_review' ? 'published' : null
  if (d === 'reject') return current === 'pending_review' ? 'rejected' : null
  if (d === 'unpublish') return current === 'published' ? 'rejected' : null
  return null
}

export async function decideProduct(actorId: string, id: string, d: ProductDecision, note?: string | null): Promise<ProductDoc> {
  const { productsCol, nowIso } = await import('./db')
  const col = await productsCol()
  const p = await col.findOne({ id }, { projection: { _id: 0 } })
  if (!p) throw new MktError(404, 'Product not found')
  const to = nextProductStatus(p.status, d)
  if (!to) throw new MktError(409, `Can't ${d} a product that is ${p.status.replace('_', ' ')}.`)
  const reason = String(note || '').trim().slice(0, 1000) || null
  if (d !== 'approve' && !reason) throw new MktError(400, 'Add a short reason for the seller.')
  const r = await col.updateOne({ id, status: p.status }, { $set: { status: to, review_note: reason, updated_at: nowIso() } })
  if (!r.modifiedCount) throw new MktError(409, 'This product was just updated — reload and try again.')
  const { knowledgeOnMarketplaceProduct } = await import('@/lib/rag/hooks')
  knowledgeOnMarketplaceProduct(id)
  const { audit, getSellerById } = await import('./sellers')
  await audit(actorId, `product.${d}`, id, reason, 'product')
  const seller = await getSellerById(p.seller_id)
  if (seller) {
    const { notifySeller } = await import('./seller-notify')
    if (d === 'approve') await notifySeller(seller, 'mkt.product_approved', 'Product approved', `"${p.title.slice(0, 80)}" is now live in the store.`, '/dashboard/seller?tab=products')
    else await notifySeller(seller, 'mkt.product_rejected', d === 'unpublish' ? 'Product unpublished' : 'Product needs changes', `"${p.title.slice(0, 80)}": ${reason}`, `/dashboard/seller?tab=products&edit=${p.id}`)
  }
  return { ...p, status: to, review_note: reason }
}

export async function listOrdersAdmin(opts: { status?: string | null; q?: string | null; limit?: number; before?: string | null } = {}) {
  const { ordersCol } = await import('./db')
  const f: Record<string, unknown> = {}
  if (opts.status) f.status = opts.status
  if (opts.q) f.number = { $regex: esc(opts.q.slice(0, 40)), $options: 'i' }
  if (opts.before) f.created_at = { $lt: opts.before }
  return (await ordersCol()).find(f, { projection: { _id: 0, shipping_address: 0 } }).sort({ created_at: -1 }).limit(Math.min(200, opts.limit ?? 50)).toArray()
}

export async function listRefundsAdmin(status?: string | null): Promise<RefundRequestDoc[]> {
  const { refundsCol } = await import('./db')
  const q: Record<string, unknown> = status ? { status } : {}
  return (await refundsCol()).find(q, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(300).toArray() as Promise<RefundRequestDoc[]>
}

/**
 * Money back to the buyer through the buyer part's refund executor (gateway
 * refund → ledger → order update → e-mail). Imported directly — never via a
 * side-effect registration — so a cold process can't silently skip the gateway
 * refund. If the import or refund fails, decideRefund reopens the request.
 */
async function executeRefund(order: Order, r: RefundRequestDoc, amount: number): Promise<{ via: 'buyer_part' }> {
  const { refundLines } = await import('./orders')
  await refundLines(order.id, r.line_ids, amount, r.id, { reason: 'approved', restock: true })
  return { via: 'buyer_part' }
}

export async function decideRefund(actorId: string, id: string, decision: 'approve' | 'reject', opts: { amount?: number | null; note?: string | null } = {}): Promise<RefundRequestDoc & { via?: string }> {
  const { refundsCol, ordersCol, nowIso } = await import('./db')
  const col = await refundsCol()
  const r = await col.findOne({ id }, { projection: { _id: 0 } }) as RefundRequestDoc | null
  if (!r) throw new MktError(404, 'Refund request not found')
  if (r.status !== 'open') throw new MktError(409, `This request is already ${r.status}.`)
  const note = String(opts.note || '').trim().slice(0, 1000) || null
  if (decision === 'reject') {
    if (!note) throw new MktError(400, 'Add a reason for the buyer.')
    const u = await col.updateOne({ id, status: 'open' }, { $set: { status: 'rejected', decided_by: actorId, decided_at: nowIso(), note, updated_at: nowIso() } })
    if (!u.modifiedCount) throw new MktError(409, 'This request was just updated — reload and try again.')
    const { audit } = await import('./sellers')
    await audit(actorId, 'refund.rejected', id, note, 'refund')
    const { notify } = await import('@/lib/notifications')
    await notify({ user_id: r.buyer_id, type: 'mkt.refund_update', title: 'Refund request declined', message: note, link: `/dashboard/orders/${r.order_id}` }).catch(() => null)
    return { ...r, status: 'rejected', note }
  }
  const order = (await (await ordersCol()).findOne({ id: r.order_id }, { projection: { _id: 0 } })) as Order | null
  if (!order) throw new MktError(404, 'Order not found')
  const maxLines = order.lines.filter((l) => r.line_ids.includes(l.id)).reduce((a, l) => a + l.line_total, 0)
  const amount = opts.amount ?? r.amount
  if (!Number.isInteger(amount) || amount <= 0) throw new MktError(400, 'Refund amount must be a positive whole number of minor units.')
  if (amount > order.grand_total || amount > Math.max(maxLines, r.amount)) throw new MktError(400, 'Refund amount is more than was paid for these items.')
  // Claim first so a double click can't refund twice.
  const claim = await col.updateOne({ id, status: 'open' }, { $set: { status: 'approved', decided_by: actorId, decided_at: nowIso(), note, amount, updated_at: nowIso() } })
  if (!claim.modifiedCount) throw new MktError(409, 'This request was just updated — reload and try again.')
  let via: string
  try {
    via = (await executeRefund(order, { ...r, amount }, amount)).via
  } catch (e) {
    await col.updateOne({ id, status: 'approved' }, { $set: { status: 'open', note: `Refund failed: ${(e as Error)?.message?.slice(0, 200)}`, updated_at: nowIso() } })
    const status = (e as { status?: unknown })?.status
    throw e instanceof MktError ? e : new MktError(typeof status === 'number' && status < 500 ? status : 502, `${(e as Error)?.message || 'The refund could not be completed.'} The request is open again.`)
  }
  await col.updateOne({ id }, { $set: { status: 'refunded', updated_at: nowIso() } })
  const { audit, getSellerById } = await import('./sellers')
  await audit(actorId, 'refund.approved', id, `${amount} ${r.currency} via ${via}`, 'refund')
  const { notify } = await import('@/lib/notifications')
  await notify({ user_id: r.buyer_id, type: 'mkt.refund_update', title: 'Refund approved', message: `Your refund for order ${order.number} has been approved.`, link: `/dashboard/orders/${r.order_id}` }).catch(() => null)
  const seller = await getSellerById(r.seller_id)
  if (seller) {
    const { notifySeller } = await import('./seller-notify')
    await notifySeller(seller, 'mkt.refund_processed', `Refund on order ${order.number}`, 'A refund was approved on your order; your balance has been adjusted.', '/dashboard/seller?tab=returns')
  }
  return { ...r, status: 'refunded', amount, note, via }
}
