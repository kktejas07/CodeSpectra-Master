/** POST { type, title?, description_md, duration_min, currency, price (minor units), provider? } → a marketplace service product, submitted for review. */
import type { NextRequest } from 'next/server'
import { bodyOf, errorResponse, json, userGate } from '@/lib/mentors/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const g = await userGate(req, { write: true })
  if ('res' in g) return g.res
  try {
    const { createOffering } = await import('@/lib/mentors/service')
    const p = await createOffering(g.user.id, await bodyOf(req))
    return json({ offering: { id: p.id, slug: p.slug, status: p.status } }, 201)
  } catch (e) {
    return errorResponse(e, 'mentor offering create')
  }
}
