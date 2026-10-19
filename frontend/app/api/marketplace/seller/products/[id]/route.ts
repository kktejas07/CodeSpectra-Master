import type { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { bodyOf, errorResponse, idOk, json, sellerGate } from '@/lib/marketplace/seller-api'

export async function GET(req: NextRequest, { params }: IdRouteContext) {
  const g = await sellerGate(req)
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return json({ error: 'Product not found' }, 404)
  try {
    const { getSellerProduct } = await import('@/lib/marketplace/listings')
    return json({ product: await getSellerProduct(g.seller.id, id) })
  } catch (e) {
    return errorResponse(e, 'product get')
  }
}

export async function PATCH(req: NextRequest, { params }: IdRouteContext) {
  const g = await sellerGate(req, { approved: true, write: true })
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return json({ error: 'Product not found' }, 404)
  try {
    const { updateProduct } = await import('@/lib/marketplace/listings')
    return json({ product: await updateProduct(g.seller, id, await bodyOf(req)) })
  } catch (e) {
    return errorResponse(e, 'product update')
  }
}

/** POST { action: 'submit' | 'restore' } */
export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const g = await sellerGate(req, { approved: true, write: true })
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return json({ error: 'Product not found' }, 404)
  try {
    const { submitProduct, restoreProduct } = await import('@/lib/marketplace/listings')
    const action = (await bodyOf(req)).action
    if (action === 'submit') return json({ product: await submitProduct(g.seller, id) })
    if (action === 'restore') return json({ product: await restoreProduct(g.seller, id) })
    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    return errorResponse(e, 'product action')
  }
}

export async function DELETE(req: NextRequest, { params }: IdRouteContext) {
  const g = await sellerGate(req, { write: true })
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return json({ error: 'Product not found' }, 404)
  try {
    const { removeProduct } = await import('@/lib/marketplace/listings')
    return json({ result: await removeProduct(g.seller, id) })
  } catch (e) {
    return errorResponse(e, 'product delete')
  }
}
