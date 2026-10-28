import type { NextRequest } from 'next/server'
import { bodyOf, errorResponse, json, sellerGate } from '@/lib/marketplace/seller-api'

export async function GET(req: NextRequest) {
  const g = await sellerGate(req)
  if ('res' in g) return g.res
  try {
    const { listSellerProducts } = await import('@/lib/marketplace/listings')
    const status = new URL(req.url).searchParams.get('status')
    return json({ products: await listSellerProducts(g.seller.id, status && /^[a-z_]{3,20}$/.test(status) ? status : null) })
  } catch (e) {
    return errorResponse(e, 'products list')
  }
}

export async function POST(req: NextRequest) {
  const g = await sellerGate(req, { approved: true, write: true })
  if ('res' in g) return g.res
  try {
    const { createProduct } = await import('@/lib/marketplace/listings')
    return json({ product: await createProduct(g.seller, await bodyOf(req)) }, 201)
  } catch (e) {
    return errorResponse(e, 'product create')
  }
}
