import type { NextRequest } from 'next/server'
import { errorResponse, json, sellerGate } from '@/lib/marketplace/seller-api'

export async function GET(req: NextRequest) {
  const g = await sellerGate(req)
  if ('res' in g) return g.res
  try {
    const { reviewsCol, productsCol } = await import('@/lib/marketplace/db')
    const reviews = await (await reviewsCol()).find({ seller_id: g.seller.id, status: 'published' }, { projection: { _id: 0, user_id: 0, order_id: 0 } }).sort({ created_at: -1 }).limit(200).toArray()
    const titles = new Map((await (await productsCol()).find({ id: { $in: [...new Set(reviews.map((r) => r.product_id))] } }, { projection: { id: 1, title: 1 } }).toArray()).map((p) => [p.id, p.title]))
    return json({ reviews: reviews.map((r) => ({ ...r, product_title: titles.get(r.product_id) ?? '' })) })
  } catch (e) {
    return errorResponse(e, 'reviews')
  }
}
