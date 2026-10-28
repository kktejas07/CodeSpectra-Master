/** GET — one mentoring session (booking) for its learner or mentor. */
import type { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { errorResponse, idOk, json, userGate } from '@/lib/mentors/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: IdRouteContext) {
  const g = await userGate(req)
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return json({ error: 'Session not found', code: 'session_not_found' }, 404)
  try {
    const { getSession } = await import('@/lib/mentors/sessions')
    return json({ session: await getSession(g.user.id, id) })
  } catch (e) {
    return errorResponse(e, 'mentor session')
  }
}
