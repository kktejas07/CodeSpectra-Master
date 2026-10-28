/**
 * GET /api/marketplace/seller/analytics?preset=30d | from=&to= — the seller's
 * own sales analytics: product views → carts → checkouts → paid orders,
 * KPIs with previous-period change, and per-product views / orders / conversion.
 * Seller from the session (superadmins: ?as=platform for the platform store).
 */
import type { NextRequest } from 'next/server'
import { errorResponse, json, sellerGate } from '@/lib/marketplace/seller-api'
import { parseRange } from '@/lib/analytics/range'

export async function GET(req: NextRequest) {
  const g = await sellerGate(req)
  if ('res' in g) return g.res
  try {
    const sp = new URL(req.url).searchParams
    const range = parseRange({ from: sp.get('from'), to: sp.get('to'), preset: sp.get('preset') })
    const { getSellerSales } = await import('@/lib/analytics/query')
    return json({ range: { from: range.from.toISOString(), to: range.to.toISOString(), days: range.days }, ...(await getSellerSales(range, { kind: 'seller', sellerId: g.seller.id })) })
  } catch (e) {
    return errorResponse(e, 'seller analytics')
  }
}
