import { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { recordClientDecision } from '@/lib/ats/engine'
import { auditAts, canActOnStage } from '@/lib/ats/access'
import { bodyOf, errorResponse, gate, json, loadApplication } from '@/lib/ats/http'
import { limitRequest } from '@/lib/rate-limit'

/**
 * POST /api/ats/applications/[id]/client-decision { decision: 'approve' | 'reject', note? }
 * The client review decision for an application at a client_review stage. Clients
 * (own client's jobs, client-visible stage), admins, recruiters and hiring managers.
 * Recorded as the stage result: the stage's advance / on_fail rules apply.
 */
export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(req, 'application.approve', ['admin', 'recruiter', 'hiring_manager', 'client'])
  if ('res' in g) return g.res
  const limited = await limitRequest(req, 'ats-client-decision', g.actor.userId, 60, 60_000)
  if (limited) return limited
  try {
    const { app, job } = await loadApplication(g.actor, (await params).id)
    const stage = job.pipeline.find((s) => s.id === app.stage_id)
    if (!stage || stage.type !== 'client_review') return json({ error: 'This candidate is not waiting for a client review' }, 409)
    if (!canActOnStage(g.actor, stage)) return json({ error: "You can't act on this stage" }, 403)
    const body = await bodyOf(req)
    if (body.decision !== 'approve' && body.decision !== 'reject') return json({ error: "decision must be 'approve' or 'reject'" }, 400)
    const note = typeof body.note === 'string' ? body.note : undefined
    const updated = await recordClientDecision(g.actor, app.id, body.decision, note)
    await auditAts(g.actor, `ats.application.client_${body.decision}`, 'ats_application', app.id, note?.slice(0, 200), req)
    return json({ application: g.actor.role === 'client' ? { id: updated.id, stage_id: updated.stage_id, status: updated.status } : updated })
  } catch (e) {
    return errorResponse(e, 'client-decision POST')
  }
}
