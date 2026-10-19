import type { NextRequest } from 'next/server'
import { errorResponse, json, sellerGate } from '@/lib/marketplace/seller-api'

export async function GET(req: NextRequest) {
  const g = await sellerGate(req)
  if ('res' in g) return g.res
  try {
    const { sellerOverview } = await import('@/lib/marketplace/fulfilment')
    return json(await sellerOverview(g.seller))
  } catch (e) {
    return errorResponse(e, 'overview')
  }
}
