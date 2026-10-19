import type { NextRequest } from 'next/server'
import { adminGate, errorResponse, idOk, json } from '@/lib/marketplace/seller-api'

export async function GET(req: NextRequest) {
  const g = await adminGate(req)
  if ('res' in g) return g.res
  try {
    const sp = new URL(req.url).searchParams
    const status = sp.get('status') ?? 'pending_review'
    const seller = sp.get('seller')
    const { listProductsAdmin } = await import('@/lib/marketplace/moderation')
    return json({ products: await listProductsAdmin({ status: status === 'all' ? null : /^[a-z_]{3,20}$/.test(status) ? status : 'pending_review', sellerId: idOk(seller) ? seller : null }) })
  } catch (e) {
    return errorResponse(e, 'admin products')
  }
}
