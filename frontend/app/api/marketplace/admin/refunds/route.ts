import type { NextRequest } from 'next/server'
import { adminGate, errorResponse, json } from '@/lib/marketplace/seller-api'

export async function GET(req: NextRequest) {
  const g = await adminGate(req)
  if ('res' in g) return g.res
  try {
    const status = new URL(req.url).searchParams.get('status') ?? 'open'
    const { listRefundsAdmin } = await import('@/lib/marketplace/moderation')
    return json({ refunds: await listRefundsAdmin(status === 'all' ? null : /^[a-z]{3,10}$/.test(status) ? status : 'open') })
  } catch (e) {
    return errorResponse(e, 'admin refunds')
  }
}
