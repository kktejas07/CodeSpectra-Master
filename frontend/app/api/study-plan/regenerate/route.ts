/** POST — rebuild this week from the latest results (keeps check-offs). Limited to 5 an hour. */
import type { NextRequest } from 'next/server'
import { errorResponse, gate, json } from '@/lib/study-plan/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const g = await gate(req, { write: true, bucket: 'study-plan-regen', max: 5, windowMs: 60 * 60_000 })
  if ('res' in g) return g.res
  try {
    const { regeneratePlan, planView } = await import('@/lib/study-plan/service')
    await regeneratePlan(g.user.id, 'rebuild')
    return json({ view: await planView(g.user.id) })
  } catch (e) {
    return errorResponse(e, 'plan regenerate')
  }
}
