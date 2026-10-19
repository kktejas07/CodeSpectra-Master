import type { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { errorResponse, idOk, json, sellerGate } from '@/lib/marketplace/seller-api'

export async function DELETE(req: NextRequest, { params }: IdRouteContext) {
  const g = await sellerGate(req, { write: true })
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return json({ error: 'File not found' }, 404)
  try {
    const { deleteSellerFiles } = await import('@/lib/marketplace/seller-files')
    const n = await deleteSellerFiles(g.seller.id, [id])
    if (!n) return json({ error: 'This file is used by a listed product (or was already deleted).' }, 409)
    return json({ ok: true })
  } catch (e) {
    return errorResponse(e, 'file delete')
  }
}
