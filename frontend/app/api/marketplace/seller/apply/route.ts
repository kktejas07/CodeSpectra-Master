import type { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { bodyOf, errorResponse, json } from '@/lib/marketplace/seller-api'

/** POST /api/marketplace/seller/apply — apply (or re-apply after a rejection) to sell. */
export async function POST(req: NextRequest) {
  const a = await requireAuth()
  if ('error' in a) return json({ error: a.error }, a.status)
  const limited = await limitRequest(req, 'mkt-apply', a.user.id, 5, 60 * 60_000)
  if (limited) return limited
  try {
    const { applyToSell, publicSeller } = await import('@/lib/marketplace/sellers')
    const s = await applyToSell({ id: a.user.id, email: a.user.email }, await bodyOf(req))
    return json({ seller: publicSeller(s) }, 201)
  } catch (e) {
    return errorResponse(e, 'apply')
  }
}
