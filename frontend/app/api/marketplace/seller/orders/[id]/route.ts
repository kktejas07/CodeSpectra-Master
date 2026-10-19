import type { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { bodyOf, errorResponse, idOk, json, sellerGate } from '@/lib/marketplace/seller-api'

const ACTIONS = ['processing', 'shipped', 'delivered', 'completed', 'cancelled'] as const

/** POST { line_id, action, carrier?, tracking_no?, tracking_url?, reason? } */
export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const g = await sellerGate(req, { write: true })
  if ('res' in g) return g.res
  const { id } = await params
  const b = await bodyOf(req)
  if (!idOk(id) || !idOk(b.line_id)) return json({ error: 'Order not found' }, 404)
  const action = ACTIONS.find((a) => a === b.action)
  if (!action) return json({ error: 'Unknown action' }, 400)
  if (g.seller.status === 'suspended' && action !== 'cancelled') return json({ error: 'Your seller account is suspended.' }, 403)
  try {
    const { updateLine } = await import('@/lib/marketplace/fulfilment')
    const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
    return json({ order: await updateLine(g.seller, id, b.line_id, action, { carrier: str(b.carrier), tracking_no: str(b.tracking_no), tracking_url: str(b.tracking_url), reason: str(b.reason) }) })
  } catch (e) {
    return errorResponse(e, 'fulfil')
  }
}
