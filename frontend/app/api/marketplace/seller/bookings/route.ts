import type { NextRequest } from 'next/server'
import { errorResponse, json, sellerGate } from '@/lib/marketplace/seller-api'

export async function GET(req: NextRequest) {
  const g = await sellerGate(req)
  if ('res' in g) return g.res
  try {
    const { listSellerBookings } = await import('@/lib/marketplace/fulfilment')
    return json({ bookings: await listSellerBookings(g.seller.id, { upcoming: new URL(req.url).searchParams.get('upcoming') === '1' }) })
  } catch (e) {
    return errorResponse(e, 'bookings')
  }
}
