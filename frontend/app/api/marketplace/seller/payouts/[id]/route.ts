import type { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { errorResponse, idOk, json, sellerGate } from '@/lib/marketplace/seller-api'

/** DELETE — cancel a requested payout (funds return to the balance). */
export async function DELETE(req: NextRequest, { params }: IdRouteContext) {
  const g = await sellerGate(req, { write: true })
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return json({ error: 'Payout not found' }, 404)
  try {
    const { cancelPayout } = await import('@/lib/marketplace/payouts')
    await cancelPayout(g.seller, id)
    return json({ ok: true })
  } catch (e) {
    return errorResponse(e, 'payout cancel')
  }
}
