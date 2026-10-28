import { NextRequest } from 'next/server'
import { atsApplications, atsCandidates, atsJobs } from '@/lib/ats/db'
import { canActOnStage, canSeeApplication, getAccessSettings } from '@/lib/ats/access'
import { errorResponse, gate, jobScopeFilter, json } from '@/lib/ats/http'
import type { AtsApplication, AtsCandidate, AtsJob } from '@/lib/ats/contract'

/** GET /api/ats/approvals — suggested moves waiting for this actor. */
export async function GET(req: NextRequest) {
  const g = await gate(req, 'application.approve')
  if ('res' in g) return g.res
  try {
    const { actor } = g
    const scope = await jobScopeFilter(actor)
    if (!scope) return json({ approvals: [] })
    const jobs = (await (await atsJobs()).find(scope, { projection: { _id: 0 } }).limit(1000).toArray()) as AtsJob[]
    if (!jobs.length) return json({ approvals: [] })
    const byId = new Map(jobs.map((j) => [j.id, j]))
    const apps = (await (await atsApplications())
      .find({ tenant_id: actor.tenantId, job_id: { $in: jobs.map((j) => j.id) }, pending_move: { $ne: null }, status: { $in: ['active', 'on_hold'] } }, { projection: { _id: 0 } })
      .sort({ 'pending_move.suggested_at': 1 })
      .limit(500)
      .toArray()) as AtsApplication[]
    const settings = await getAccessSettings(actor.tenantId)
    const mine = apps.filter((a) => {
      const job = byId.get(a.job_id)!
      const stage = job.pipeline.find((s) => s.id === a.stage_id)
      return !!stage && canActOnStage(actor, stage) && canSeeApplication(actor, a, job, { settings })
    })
    const cands = new Map(
      ((await (await atsCandidates()).find({ tenant_id: actor.tenantId, id: { $in: mine.map((a) => a.candidate_id) } }, { projection: { _id: 0, id: 1, name: 1 } }).toArray()) as Pick<AtsCandidate, 'id' | 'name'>[]).map((c) => [c.id, c]),
    )
    return json({
      approvals: mine.map((a) => {
        const job = byId.get(a.job_id)!
        return {
          application_id: a.id,
          job: { id: job.id, title: job.title },
          candidate: { id: a.candidate_id, name: cands.get(a.candidate_id)?.name ?? 'Candidate' },
          from: job.pipeline.find((s) => s.id === a.stage_id) ?? null,
          to: job.pipeline.find((s) => s.id === a.pending_move!.to) ?? null,
          reason: a.pending_move!.reason,
          suggested_at: a.pending_move!.suggested_at,
          match: actor.role === 'client' ? null : a.match?.score ?? null,
        }
      }),
    })
  } catch (e) {
    return errorResponse(e, 'approvals GET')
  }
}
