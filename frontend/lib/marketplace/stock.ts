/**
 * Oversell protection. Stock is decremented with ONE conditional update per item
 * ("only if at least qty left"), which MongoDB applies atomically per document — two buyers
 * racing for the last unit can't both win. A multi-item reservation rolls back the units it
 * already took when a later item is short. `stock: null` = unlimited (nothing to reserve).
 */
import 'server-only'
import { productsCol, nowIso } from './db'

export interface StockItem { product_id: string; variant_id?: string | null; qty: number }

/** Take `qty` of one item: 'taken', 'unlimited' (nothing to count) or null when short. */
export async function takeOne(item: StockItem): Promise<'taken' | 'unlimited' | null> {
  const col = await productsCol()
  const p = await col.findOne({ id: item.product_id }, { projection: { _id: 0, stock: 1, variants: 1 } })
  if (!p) return null
  if (item.variant_id) {
    const v = p.variants?.find((x) => x.id === item.variant_id)
    if (!v) return null
    if (v.stock == null) return 'unlimited'
    const r = await col.updateOne(
      { id: item.product_id, variants: { $elemMatch: { id: item.variant_id, stock: { $gte: item.qty } } } } as never,
      { $inc: { 'variants.$.stock': -item.qty }, $set: { updated_at: nowIso() } } as never,
    )
    return r.modifiedCount === 1 ? 'taken' : null
  }
  if (p.stock == null) return 'unlimited'
  const r = await col.updateOne({ id: item.product_id, stock: { $gte: item.qty } }, { $inc: { stock: -item.qty }, $set: { updated_at: nowIso() } })
  return r.modifiedCount === 1 ? 'taken' : null
}

/** Give units back (release / cancel / refund before dispatch). */
export async function giveBack(item: StockItem): Promise<void> {
  const col = await productsCol()
  if (item.variant_id) {
    await col.updateOne(
      { id: item.product_id, variants: { $elemMatch: { id: item.variant_id, stock: { $ne: null } } } } as never,
      { $inc: { 'variants.$.stock': item.qty } } as never,
    )
    return
  }
  await col.updateOne({ id: item.product_id, stock: { $ne: null } } as never, { $inc: { stock: item.qty } })
}

/**
 * All-or-nothing reservation. `taken` lists the items whose stock was actually decremented
 * (store it — only those are given back on release).
 */
export async function reserveAll(items: StockItem[]): Promise<{ short: StockItem | null; taken: StockItem[] }> {
  const taken: StockItem[] = []
  for (const it of items) {
    const r = await takeOne(it)
    if (r === 'taken') { taken.push(it); continue }
    if (r === 'unlimited') continue
    for (const t of [...taken].reverse()) await giveBack(t)
    return { short: it, taken: [] }
  }
  return { short: null, taken }
}

export async function releaseAll(items: StockItem[]): Promise<void> {
  for (const it of items) await giveBack(it)
}
