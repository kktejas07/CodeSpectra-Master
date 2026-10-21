/** GET /api/marketplace/orders/[id]/ics?line=<lineId> — calendar invite for a booked session. */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import type { IdRouteContext } from '@/lib/app-route-context'
import { getBuyerOrder } from '@/lib/marketplace/orders'
import { bookingIcs } from '@/lib/marketplace/emails'
import { bookings } from '@/lib/marketplace/booking'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await params
  const order = await getBuyerOrder(gate.user.id, id)
  const line = order?.lines.find((l) => l.id === req.nextUrl.searchParams.get('line'))
  if (!order || !line || line.kind !== 'service' || line.fulfilment.status !== 'booked') return NextResponse.json({ error: 'Booking not found', code: 'mkt_booking_not_found' }, { status: 404 })
  const b = await (await bookings()).findOne({ order_id: order.id, line_id: line.id, status: { $in: ['booked', 'completed'] } } as never, { projection: { _id: 0 } })
  const ics = bookingIcs(order, { ...line, fulfilment: { ...line.fulfilment, booking: b ? { start: b.start, end: b.end, join_url: b.join_url ?? undefined } : line.fulfilment.booking } })
  if (!ics) return NextResponse.json({ error: 'Booking not found', code: 'mkt_booking_not_found' }, { status: 404 })
  return new NextResponse(ics, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="booking-${order.number}.ics"`, 'Cache-Control': 'private, no-store' } })
}
