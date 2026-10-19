import type { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { adminGate, bodyOf, errorResponse, idOk, json } from '@/lib/marketplace/seller-api'

/** POST { decision: approve|reject|unpublish, note? } */
export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const g = await adminGate(req, { write: true })
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return json({ error: 'Product not found' }, 404)
  try {
    const b = await bodyOf(req)
    const d = (['approve', 'reject', 'unpublish'] as const).find((x) => x === b.decision)
    if (!d) return json({ error: 'Unknown decision' }, 400)
    const { decideProduct } = await import('@/lib/marketplace/moderation')
    return json({ product: await decideProduct(g.user.id, id, d, typeof b.note === 'string' ? b.note : null) })
  } catch (e) {
    return errorResponse(e, 'product decide')
  }
}
