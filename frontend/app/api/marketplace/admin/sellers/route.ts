import type { NextRequest } from 'next/server'
import { adminGate, errorResponse, json } from '@/lib/marketplace/seller-api'

export async function GET(req: NextRequest) {
  const g = await adminGate(req)
  if ('res' in g) return g.res
  try {
    const sp = new URL(req.url).searchParams
    const { listSellersAdmin } = await import('@/lib/marketplace/moderation')
    const { ensurePlatformSeller } = await import('@/lib/marketplace/sellers')
    await ensurePlatformSeller()
    const status = sp.get('status')
    return json({ sellers: await listSellersAdmin({ status: status && /^[a-z]{3,12}$/.test(status) ? status : null, q: sp.get('q') }) })
  } catch (e) {
    return errorResponse(e, 'sellers')
  }
}
