/**
 * Verified-purchase reviews (1–5 + optional title/text). One per buyer per product.
 * Reviews with links / e-mail addresses / phone numbers are stored hidden for moderation;
 * the product's rating average counts published reviews only.
 */
import 'server-only'
import { newId, nowIso, productsCol, reviewsCol } from './db'
import { orders } from './order-doc'
import { canReview, needsModeration } from './rules'
import { CartError } from './cart'

export function parseReview(raw: unknown): { rating: number; title?: string; body?: string } | null {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const rating = Number(b.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null
  const title = typeof b.title === 'string' ? b.title.trim().slice(0, 120) : ''
  const body = typeof b.body === 'string' ? b.body.trim().slice(0, 2000) : ''
  return { rating, ...(title ? { title } : {}), ...(body ? { body } : {}) }
}

export async function refreshRating(productId: string): Promise<void> {
  const rows = await (await reviewsCol()).find({ product_id: productId, status: 'published' }, { projection: { _id: 0, rating: 1 } }).limit(10_000).toArray()
  const count = rows.length
  const avg = count ? Math.round((rows.reduce((a, r) => a + r.rating, 0) / count) * 10) / 10 : 0
  await (await productsCol()).updateOne({ id: productId }, { $set: { rating: { avg, count } } })
}

export async function createReview(userId: string, productId: string, raw: unknown): Promise<{ status: 'published' | 'hidden' }> {
  const input = parseReview(raw)
  if (!input) throw new CartError(400, 'Choose a rating from 1 to 5.')
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(productId)) throw new CartError(400, 'Invalid product')
  const candidates = await (await orders()).find({ buyer_id: userId, 'lines.product_id': productId } as never, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(20).toArray()
  const hit = candidates.map((o) => ({ o, l: o.lines.find((l) => l.product_id === productId && canReview(o, l)) })).find((x) => x.l)
  if (!hit?.l) throw new CartError(403, 'You can review this item after it has been delivered or your session has taken place.')
  const status = needsModeration(`${input.title ?? ''} ${input.body ?? ''}`) ? 'hidden' : 'published'
  try {
    await (await reviewsCol()).insertOne({ id: newId(), product_id: productId, seller_id: hit.l.seller_id, order_id: hit.o.id, user_id: userId, ...input, status, created_at: nowIso() })
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) throw new CartError(409, 'You have already reviewed this item.')
    throw e
  }
  if (status === 'published') await refreshRating(productId)
  return { status }
}
