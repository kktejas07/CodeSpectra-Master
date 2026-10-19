import { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { auditAts } from '@/lib/ats/access'
import { atsApplications, atsCandidates, nowIso } from '@/lib/ats/db'
import { bodyOf, errorResponse, gate, json, loadApplication } from '@/lib/ats/http'
import { parseCompensation, withCompensation } from '@/lib/ats/compensation'
import { limitRequest } from '@/lib/rate-limit'

/**
 * PATCH /api/ats/applications/[id]/compensation { experience_level, currency, period, current_ctc, … }
 * Recruiter / admin edit (source 'recruiter'); the previous figures stay in history.
 */
export async function PATCH(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(req, 'candidate.salary', ['admin', 'recruiter'])
  if ('res' in g) return g.res
  const limited = await limitRequest(req, 'ats-compensation', g.actor.userId, 30, 60_000)
  if (limited) return limited
  try {
    const { app } = await loadApplication(g.actor, (await params).id)
    const cand = await (await atsCandidates()).findOne({ id: app.candidate_id, tenant_id: g.actor.tenantId }, { projection: { _id: 0, country: 1 } })
    const parsed = parseCompensation(await bodyOf(req), { source: 'recruiter', country: (cand?.country as string | null) ?? null, confirmedAt: nowIso() })
    if (!parsed.ok) return json({ error: parsed.errors[0], errors: parsed.errors }, 400)
    const next = withCompensation(app, parsed.value)
    await (await atsApplications()).updateOne({ id: app.id, tenant_id: g.actor.tenantId }, { $set: { ...next, updated_at: nowIso() } })
    await auditAts(g.actor, 'ats.application.compensation', 'ats_application', app.id, parsed.value.experience_level, req)
    return json({ compensation: next.compensation, compensation_history: next.compensation_history })
  } catch (e) {
    return errorResponse(e, 'compensation PATCH')
  }
}
