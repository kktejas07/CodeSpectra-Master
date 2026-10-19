import type { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { adminGate, bodyOf, errorResponse, idOk, json } from '@/lib/marketplace/seller-api'

/** POST { decision: approve|reject, amount?, note? } */
export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const g = await adminGate(req, { write: true })
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return json({ error: 'Refund request not found' }, 404)
  try {
    const b = await bodyOf(req)
    const d = (['approve', 'reject'] as const).find((x) => x === b.decision)
    if (!d) return json({ error: 'Unknown decision' }, 400)
    const amount = b.amount === undefined || b.amount === null || b.amount === '' ? null : Number(b.amount)
    const { decideRefund } = await import('@/lib/marketplace/moderation')
    return json({ refund: await decideRefund(g.user.id, id, d, { amount, note: typeof b.note === 'string' ? b.note : null }) })
  } catch (e) {
    return errorResponse(e, 'refund decide')
  }
}
