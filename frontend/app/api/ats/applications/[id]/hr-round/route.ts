import { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { auditAts } from '@/lib/ats/access'
import { bodyOf, errorResponse, gate, json, loadApplication } from '@/lib/ats/http'
import { hrRoundStatus, resendHrLink } from '@/lib/ats/hr/service'
import { limitRequest } from '@/lib/rate-limit'

/** GET /api/ats/applications/[id]/hr-round → form status, decision, whether compensation is confirmed. Staff with salary access. */
export async function GET(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(req, 'candidate.salary', ['admin', 'recruiter', 'hiring_manager'])
  if ('res' in g) return g.res
  try {
    const { app, job } = await loadApplication(g.actor, (await params).id)
    return json(await hrRoundStatus(g.actor, app, job))
  } catch (e) {
    return errorResponse(e, 'hr-round GET')
  }
}

/** POST { action: 'resend' } — new link (older ones stop working), fresh deadline. Admin / recruiter. */
export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(req, 'application.move', ['admin', 'recruiter'])
  if ('res' in g) return g.res
  const limited = await limitRequest(req, 'ats-hr-resend', g.actor.userId, 10, 10 * 60_000)
  if (limited) return limited
  try {
    const body = await bodyOf(req)
    if (body.action !== 'resend') return json({ error: "action must be 'resend'" }, 400)
    const { app, job } = await loadApplication(g.actor, (await params).id)
    await resendHrLink(app, job)
    await auditAts(g.actor, 'ats.application.hr_form_resend', 'ats_application', app.id, undefined, req)
    return json(await hrRoundStatus(g.actor, app, job))
  } catch (e) {
    return errorResponse(e, 'hr-round POST')
  }
}
