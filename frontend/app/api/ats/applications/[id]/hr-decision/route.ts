import { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { auditAts, canActOnStage } from '@/lib/ats/access'
import { bodyOf, errorResponse, gate, json, loadApplication } from '@/lib/ats/http'
import { recordHrDecision } from '@/lib/ats/hr/service'
import { limitRequest } from '@/lib/rate-limit'

/**
 * POST /api/ats/applications/[id]/hr-decision
 *   { decision: 'pass' | 'fail' | 'hold', notes?, offered_ctc?, override?: { reason } }
 * Admin / recruiter / hiring manager. 'pass' needs the candidate's compensation form
 * when the stage collects it, unless `override.reason` explains why not.
 */
export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(req, 'application.approve', ['admin', 'recruiter', 'hiring_manager'])
  if ('res' in g) return g.res
  const limited = await limitRequest(req, 'ats-hr-decision', g.actor.userId, 60, 60_000)
  if (limited) return limited
  try {
    const { app, job } = await loadApplication(g.actor, (await params).id)
    const stage = job.pipeline.find((s) => s.id === app.stage_id)
    if (!stage || stage.type !== 'hr_round') return json({ error: 'This candidate is not in an HR round' }, 409)
    if (!canActOnStage(g.actor, stage)) return json({ error: "You can't act on this stage" }, 403)
    const body = await bodyOf(req)
    const updated = await recordHrDecision(g.actor, app.id, body)
    const detail = `${String(body.decision)}${body.override ? ' (override)' : ''}`
    await auditAts(g.actor, 'ats.application.hr_decision', 'ats_application', app.id, detail, req)
    return json({ application: updated })
  } catch (e) {
    return errorResponse(e, 'hr-decision POST')
  }
}
