/** POST { start: ISO } — learner moves the session within the mentor's reschedule policy. */
import type { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { bodyOf, errorResponse, idOk, json, userGate } from '@/lib/mentors/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const g = await userGate(req, { write: true, bucket: 'mentor-reschedule', max: 10 })
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return json({ error: 'Session not found' }, 404)
  try {
    const b = await bodyOf(req)
    const { rescheduleSession } = await import('@/lib/mentors/sessions')
    return json({ session: await rescheduleSession(g.user.id, id, b.start) })
  } catch (e) {
    return errorResponse(e, 'mentor reschedule')
  }
}
