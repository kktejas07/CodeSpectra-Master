/**
 * Code-review attachment. POST { submission_id } | { url } (learner, code review sessions only).
 * GET → the attached submission's code (learner or mentor of this booking only).
 */
import type { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { bodyOf, errorResponse, idOk, json, userGate } from '@/lib/mentors/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: IdRouteContext) {
  const g = await userGate(req)
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return json({ error: 'Session not found' }, 404)
  try {
    const { sessionAttachmentCode } = await import('@/lib/mentors/sessions')
    return json({ attachment: await sessionAttachmentCode(g.user.id, id) })
  } catch (e) {
    return errorResponse(e, 'mentor attachment read')
  }
}

export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const g = await userGate(req, { write: true, bucket: 'mentor-attach', max: 20 })
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return json({ error: 'Session not found' }, 404)
  try {
    const { attachToSession } = await import('@/lib/mentors/sessions')
    return json({ session: await attachToSession(g.user.id, id, await bodyOf(req)) })
  } catch (e) {
    return errorResponse(e, 'mentor attach')
  }
}
