import { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { moveApplication } from '@/lib/ats/engine'
import { auditAts } from '@/lib/ats/access'
import { bodyOf, errorResponse, gate, json, loadApplication } from '@/lib/ats/http'

/** POST /api/ats/applications/[id]/move { to, reason? } */
export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(req, 'application.move')
  if ('res' in g) return g.res
  try {
    const { app } = await loadApplication(g.actor, (await params).id)
    const body = await bodyOf(req)
    const to = typeof body.to === 'string' ? body.to.slice(0, 40) : ''
    if (!to) return json({ error: 'Choose a stage' }, 400)
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : undefined
    const updated = await moveApplication(g.actor, app.id, to, { reason })
    await auditAts(g.actor, 'ats.application.move', 'ats_application', app.id, `${app.stage_id} → ${to}`, req)
    return json({ application: updated })
  } catch (e) {
    return errorResponse(e, 'move POST')
  }
}
