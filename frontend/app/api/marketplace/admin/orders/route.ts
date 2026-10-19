import type { NextRequest } from 'next/server'
import { adminGate, errorResponse, json } from '@/lib/marketplace/seller-api'

export async function GET(req: NextRequest) {
  const g = await adminGate(req)
  if ('res' in g) return g.res
  try {
    const sp = new URL(req.url).searchParams
    const status = sp.get('status')
    const before = sp.get('before')
    const { listOrdersAdmin } = await import('@/lib/marketplace/moderation')
    return json({ orders: await listOrdersAdmin({ status: status && /^[a-z_]{3,24}$/.test(status) ? status : null, q: sp.get('q'), before: before && !Number.isNaN(Date.parse(before)) ? before : null }) })
  } catch (e) {
    return errorResponse(e, 'admin orders')
  }
}
