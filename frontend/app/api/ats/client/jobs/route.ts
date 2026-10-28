import { NextRequest, NextResponse } from 'next/server'
import { atsCollection, clientVisibleStageIds, requireAts, tenantFromRequest } from '@/lib/ats/access'
import type { AtsApplication, AtsJob } from '@/lib/ats/contract'

/**
 * GET /api/ats/client/jobs — client portal: the caller's client's jobs with
 * counts per client-visible stage (+ hired). Client role only.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAts(['client'], tenantFromRequest(req))
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { actor } = gate
  if (!actor.clientId) return NextResponse.json({ jobs: [], client: null })
  try {
    const [jobs, client] = await Promise.all([
      (await atsCollection<AtsJob>('jobs'))
        .find({ tenant_id: actor.tenantId, client_id: actor.clientId, status: { $ne: 'draft' } }, { projection: { _id: 0, id: 1, title: 1, location: 1, work_mode: 1, status: 1, openings: 1, pipeline: 1, updated_at: 1 } })
        .sort({ updated_at: -1 })
        .limit(200)
        .toArray(),
      (await atsCollection('clients')).findOne({ id: actor.clientId, tenant_id: actor.tenantId }, { projection: { _id: 0, id: 1, name: 1, logo_url: 1 } }),
    ])
    const ids = jobs.map((j) => j.id)
    const counts = ids.length
      ? await (await atsCollection<AtsApplication>('applications'))
          .aggregate<{ _id: { job: string; stage: string; status: string }; n: number }>([
            { $match: { tenant_id: actor.tenantId, job_id: { $in: ids } } },
            { $group: { _id: { job: '$job_id', stage: '$stage_id', status: '$status' }, n: { $sum: 1 } } },
          ])
          .toArray()
      : []
    const out = jobs.map((j) => {
      const visible = clientVisibleStageIds(j as AtsJob)
      const stages = (j.pipeline || []).filter((s) => visible.includes(s.id)).map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        count: counts.filter((c) => c._id.job === j.id && c._id.stage === s.id && (s.type === 'hired' || c._id.status !== 'rejected')).reduce((a, c) => a + c.n, 0),
      }))
      const reviewStage = stages.find((s) => s.type === 'client_review')
      return {
        id: j.id,
        title: j.title,
        location: j.location ?? null,
        work_mode: j.work_mode ?? null,
        status: j.status,
        openings: j.openings,
        updated_at: j.updated_at,
        stages,
        awaiting_review: reviewStage?.count ?? 0,
        total_visible: stages.reduce((a, s) => a + s.count, 0),
      }
    })
    return NextResponse.json({ jobs: out, client }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    console.error('[ats/client/jobs] GET failed:', e)
    return NextResponse.json({ error: 'Could not load your jobs' }, { status: 500 })
  }
}
