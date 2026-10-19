import { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { atsApplications, atsCandidates } from '@/lib/ats/db'
import { candidateViewFor, clientApplicationFilter, getAccessSettings, jobViewFor } from '@/lib/ats/access'
import { errorResponse, gate, json, loadJob } from '@/lib/ats/http'
import type { AtsApplication, AtsCandidate } from '@/lib/ats/contract'

/** GET /api/ats/jobs/[id]/board → { job, stages: [{ stage, applications: [app + candidate summary] }] } */
export async function GET(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(req, 'application.view')
  if ('res' in g) return g.res
  try {
    const { actor } = g
    const job = await loadJob(actor, (await params).id)
    const filter = actor.role === 'client' ? clientApplicationFilter(actor, job) : { tenant_id: actor.tenantId, job_id: job.id }
    if (!filter) return json({ error: 'Job not found' }, 404)
    const apps = (await (await atsApplications()).find(filter, { projection: { _id: 0 } }).sort({ stage_entered_at: -1 }).limit(3000).toArray()) as AtsApplication[]
    const ids = [...new Set(apps.map((a) => a.candidate_id))]
    const cands = ids.length
      ? ((await (await atsCandidates()).find({ tenant_id: actor.tenantId, id: { $in: ids } }, { projection: { _id: 0, 'resume.text': 0 } }).toArray()) as AtsCandidate[])
      : []
    const settings = await getAccessSettings(actor.tenantId)
    const byId = new Map(cands.map((c) => [c.id, c]))
    // Clients: client-visible stages only, no stage config / criteria / team ids (jobViewFor).
    const view = jobViewFor(actor, job)
    const stages = view.pipeline
      .map((stage) => ({
        stage,
        applications: apps
          .filter((a) => a.stage_id === stage.id)
          .map((a) => {
            const c = byId.get(a.candidate_id)
            const view = c ? candidateViewFor(actor, c, { settings }) : null
            const last = [...(a.results || [])].reverse().find((r) => r.stage_id === a.stage_id) ?? null
            return {
              id: a.id,
              stage_id: a.stage_id,
              stage_entered_at: a.stage_entered_at,
              status: a.status,
              source: a.source,
              match: actor.role === 'client' ? (a.match ? { score: a.match.score } : null) : a.match ?? null,
              pending_move: actor.role === 'client' ? null : a.pending_move ?? null,
              // Clients: HR round / BGV results without their summary (compensation, verification detail).
              last_result: actor.role === 'client' && last && (stage.type === 'hr_round' || stage.type === 'bgv') ? { ...last, summary: undefined } : last,
              rejection_reason: actor.role === 'client' ? null : a.rejection_reason ?? null,
              created_at: a.created_at,
              candidate: view && {
                id: view.id,
                name: view.name,
                email: view.email ?? null,
                phone: view.phone ?? null,
                country: view.country ?? null,
                total_years: view.parsed?.total_years ?? null,
                location: view.parsed?.location ?? null,
                skills: (view.parsed?.skills || []).slice(0, 8),
                titles: (view.parsed?.titles || []).slice(0, 2),
                tags: view.tags ?? [],
              },
            }
          }),
      }))
    return json({ job: view, stages })
  } catch (e) {
    return errorResponse(e, 'board GET')
  }
}
