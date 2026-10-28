/** GET ?from=ISO — new times the learner can move this session to (next 14 days). */
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
    const { rescheduleSlots } = await import('@/lib/mentors/sessions')
    const from = Date.parse(req.nextUrl.searchParams.get('from') || '')
    return json({ slots: await rescheduleSlots(g.user.id, id, Number.isFinite(from) ? from : Date.now()) })
  } catch (e) {
    return errorResponse(e, 'mentor reschedule slots')
  }
}
