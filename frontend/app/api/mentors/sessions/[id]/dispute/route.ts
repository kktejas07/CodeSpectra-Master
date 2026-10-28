/** POST { reason } — learner disputes a session that took place; an admin decides (Admin → Marketplace → Refunds). */
import type { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { bodyOf, errorResponse, idOk, json, userGate } from '@/lib/mentors/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const g = await userGate(req, { write: true, bucket: 'mentor-dispute', max: 5 })
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return json({ error: 'Session not found', code: 'session_not_found' }, 404)
  try {
    const b = await bodyOf(req)
    const { openDispute } = await import('@/lib/mentors/sessions')
    return json({ session: await openDispute(g.user.id, id, b.reason) })
  } catch (e) {
    return errorResponse(e, 'mentor dispute')
  }
}
