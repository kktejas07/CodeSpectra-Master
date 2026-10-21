/** POST — built-in video token for the learner or mentor of this booking (opens 15 min before the start). */
import type { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { errorResponse, idOk, json, userGate } from '@/lib/mentors/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const g = await userGate(req, { write: true, bucket: 'mentor-video', max: 20 })
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return json({ error: 'Session not found' }, 404)
  try {
    const { sessionVideoToken } = await import('@/lib/mentors/sessions')
    const r = await sessionVideoToken({ id: g.user.id, name: g.user.name, email: g.user.email }, id)
    if ('error' in r) return json({ error: r.error }, r.status)
    return json(r)
  } catch (e) {
    return errorResponse(e, 'mentor video token')
  }
}
