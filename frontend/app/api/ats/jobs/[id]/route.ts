import { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { deleteJob, updateJob } from '@/lib/ats/jobs'
import { auditAts, can, getAccessSettings, jobViewFor } from '@/lib/ats/access'
import { bodyOf, errorResponse, gate, json, loadJob } from '@/lib/ats/http'

/** GET /api/ats/jobs/[id] */
export async function GET(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(req, 'job.view')
  if ('res' in g) return g.res
  try {
    const job = await loadJob(g.actor, (await params).id)
    // Clients see the role and the client-visible stages only.
    if (g.actor.role === 'client') return json({ job: jobViewFor(g.actor, job) })
    return json({ job, can_edit: can(g.actor, 'job.edit', { settings: await getAccessSettings(g.actor.tenantId) }) })
  } catch (e) {
    return errorResponse(e, 'job GET')
  }
}

/**
 * PATCH /api/ats/jobs/[id] — fields, status, criteria, pipeline.
 * Removing a stage with candidates needs `stage_moves: { [removedStageId]: targetStageId }`.
 */
export async function PATCH(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(req, 'job.edit')
  if ('res' in g) return g.res
  try {
    const job = await loadJob(g.actor, (await params).id, 'edit')
    const body = await bodyOf(req)
    const updated = await updateJob(g.actor, job, body)
    await auditAts(g.actor, 'ats.job.update', 'ats_job', job.id, Object.keys(body).join(',').slice(0, 200), req)
    return json({ job: updated })
  } catch (e) {
    return errorResponse(e, 'job PATCH')
  }
}

/** DELETE /api/ats/jobs/[id] — only while it has no applications (close it otherwise). */
export async function DELETE(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(req, 'job.edit')
  if ('res' in g) return g.res
  try {
    const job = await loadJob(g.actor, (await params).id, 'edit')
    await deleteJob(job)
    await auditAts(g.actor, 'ats.job.delete', 'ats_job', job.id, job.title, req)
    return json({ ok: true })
  } catch (e) {
    return errorResponse(e, 'job DELETE')
  }
}
