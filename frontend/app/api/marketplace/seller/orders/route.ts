import type { NextRequest } from 'next/server'
import { errorResponse, json, sellerGate } from '@/lib/marketplace/seller-api'

/** GET ?open=1&before=<iso> → { orders } (the seller's lines only) */
export async function GET(req: NextRequest) {
  const g = await sellerGate(req)
  if ('res' in g) return g.res
  try {
    const sp = new URL(req.url).searchParams
    const { listSellerOrders } = await import('@/lib/marketplace/fulfilment')
    const before = sp.get('before')
    return json({ orders: await listSellerOrders(g.seller.id, { open: sp.get('open') === '1', before: before && !Number.isNaN(Date.parse(before)) ? before : null }) })
  } catch (e) {
    return errorResponse(e, 'orders')
  }
}
