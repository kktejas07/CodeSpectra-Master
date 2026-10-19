import type { NextRequest } from 'next/server'
import { bodyOf, errorResponse, json, sellerGate } from '@/lib/marketplace/seller-api'

export async function GET(req: NextRequest) {
  const g = await sellerGate(req)
  if ('res' in g) return g.res
  try {
    const { listPayouts } = await import('@/lib/marketplace/payouts')
    return json({ payouts: (await listPayouts({ sellerId: g.seller.id })).map(({ approved_by: _a, ...p }) => p) })
  } catch (e) {
    return errorResponse(e, 'payouts')
  }
}

/** POST { currency, amount? } — amount defaults to the full available balance. */
export async function POST(req: NextRequest) {
  const g = await sellerGate(req, { approved: true, write: true })
  if ('res' in g) return g.res
  try {
    const b = await bodyOf(req)
    const { requestPayout } = await import('@/lib/marketplace/payouts')
    const amount = b.amount === undefined || b.amount === null || b.amount === '' ? null : Number(b.amount)
    return json({ payout: await requestPayout(g.seller, b.currency as 'INR' | 'USD', amount) }, 201)
  } catch (e) {
    return errorResponse(e, 'payout request')
  }
}
