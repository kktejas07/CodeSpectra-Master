import type { NextRequest } from 'next/server'
import { adminGate, errorResponse, json } from '@/lib/marketplace/seller-api'

export async function GET(req: NextRequest) {
  const g = await adminGate(req)
  if ('res' in g) return g.res
  try {
    const status = new URL(req.url).searchParams.get('status')
    const { listPayouts } = await import('@/lib/marketplace/payouts')
    const { sellersCol } = await import('@/lib/marketplace/db')
    const payouts = await listPayouts({ status: status && status !== 'all' && /^[a-z]{3,10}$/.test(status) ? status : null }, 300)
    const names = new Map((await (await sellersCol()).find({ id: { $in: [...new Set(payouts.map((p) => p.seller_id))] } }, { projection: { id: 1, display_name: 1 } }).toArray()).map((s) => [s.id, s.display_name]))
    return json({ payouts: payouts.map((p) => ({ ...p, seller_name: names.get(p.seller_id) ?? p.seller_id })) })
  } catch (e) {
    return errorResponse(e, 'admin payouts')
  }
}
