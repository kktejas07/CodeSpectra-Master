/** GET /api/marketplace/orders/[id] — one of the caller's orders, with per-line actions. */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import type { IdRouteContext } from '@/lib/app-route-context'
import { buyerOrderView, getBuyerOrder } from '@/lib/marketplace/orders'
import { errorResponse } from '@/lib/marketplace/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await params
  try {
    const order = await getBuyerOrder(gate.user.id, id)
    if (!order) return NextResponse.json({ error: 'Order not found', code: 'mkt_order_not_found' }, { status: 404 })
    return NextResponse.json({ order: await buyerOrderView(order) })
  } catch (e) {
    return errorResponse(e, 'order read')
  }
}
