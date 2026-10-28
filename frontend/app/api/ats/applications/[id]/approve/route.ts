import { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { approvePendingMove } from '@/lib/ats/engine'
import { auditAts, canActOnStage } from '@/lib/ats/access'
import { bodyOf, errorResponse, gate, json, loadApplication } from '@/lib/ats/http'

/** POST /api/ats/applications/[id]/approve { accept } — act on the suggested move. */
export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(req, 'application.approve')
  if ('res' in g) return g.res
  try {
    const { app, job } = await loadApplication(g.actor, (await params).id)
    const stage = job.pipeline.find((s) => s.id === app.stage_id)
    if (!stage || !canActOnStage(g.actor, stage)) return json({ error: "You can't act on this stage" }, 403)
    const body = await bodyOf(req)
    if (typeof body.accept !== 'boolean') return json({ error: 'accept must be true or false' }, 400)
    const updated = await approvePendingMove(g.actor, app.id, body.accept)
    await auditAts(g.actor, body.accept ? 'ats.application.approve' : 'ats.application.decline', 'ats_application', app.id, app.pending_move?.to, req)
    return json({ application: g.actor.role === 'client' ? { id: updated.id, stage_id: updated.stage_id, status: updated.status } : updated })
  } catch (e) {
    return errorResponse(e, 'approve POST')
  }
}
