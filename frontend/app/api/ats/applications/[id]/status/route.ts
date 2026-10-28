import { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { moveApplication, setApplicationStatus } from '@/lib/ats/engine'
import { auditAts } from '@/lib/ats/access'
import { bodyOf, errorResponse, gate, json, loadApplication } from '@/lib/ats/http'

/**
 * POST /api/ats/applications/[id]/status { status, reason? }
 * active | on_hold | withdrawn change the status in place; rejected / hired move
 * the application to the job's rejected / hired stage (with its emails).
 */
export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(req, 'application.status')
  if ('res' in g) return g.res
  try {
    const { app, job } = await loadApplication(g.actor, (await params).id)
    const body = await bodyOf(req)
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : undefined
    const status = body.status
    let updated
    if (status === 'rejected' || status === 'hired') {
      const stage = job.pipeline.find((s) => s.type === status)
      if (!stage) return json({ error: `This pipeline has no ${status} stage`, code: 'ats_pipeline_no_stage', params: { status: String(status) } }, 400)
      updated = await moveApplication(g.actor, app.id, stage.id, { reason })
    } else if (status === 'active' || status === 'on_hold' || status === 'withdrawn') {
      updated = await setApplicationStatus(g.actor, app.id, status, reason)
    } else {
      return json({ error: 'Unknown status' }, 400)
    }
    await auditAts(g.actor, 'ats.application.status', 'ats_application', app.id, `${app.status} → ${String(status)}`, req)
    return json({ application: updated })
  } catch (e) {
    return errorResponse(e, 'status POST')
  }
}
