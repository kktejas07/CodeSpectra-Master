/** GET /api/marketplace/orders?before=ISO — the signed-in buyer's orders (newest first). */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { listBuyerOrders } from '@/lib/marketplace/orders'
import { errorResponse } from '@/lib/marketplace/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const before = req.nextUrl.searchParams.get('before')
  try {
    return NextResponse.json({ orders: await listBuyerOrders(gate.user.id, { before: before && Number.isFinite(Date.parse(before)) ? before : null }) })
  } catch (e) {
    return errorResponse(e, 'orders list')
  }
}
