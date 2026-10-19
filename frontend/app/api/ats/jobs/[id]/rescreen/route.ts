import { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { atsApplications, atsCandidates, nowIso } from '@/lib/ats/db'
import { recordStageResult } from '@/lib/ats/engine'
import { screenCandidate } from '@/lib/ats/handlers/screening'
import { toMatch } from '@/lib/ats/screening-score'
import { auditAts } from '@/lib/ats/access'
import { bodyOf, errorResponse, gate, json, loadJob } from '@/lib/ats/http'
import { limitRequest } from '@/lib/rate-limit'
import type { AtsApplication, AtsCandidate } from '@/lib/ats/contract'

export const maxDuration = 300

/**
 * POST /api/ats/jobs/[id]/rescreen { application_ids?: string[] } — recompute
 * match scores against the job's current criteria. Applications sitting in a
 * screening stage also get the new pass/fail applied (on_fail / advance rules).
 */
export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(req, 'application.move')
  if ('res' in g) return g.res
  const limited = await limitRequest(req, 'ats-rescreen', g.actor.userId, 6, 60_000)
  if (limited) return limited
  try {
    const job = await loadJob(g.actor, (await params).id, 'edit')
    const body = await bodyOf(req)
    const only = Array.isArray(body.application_ids) ? body.application_ids.filter((x): x is string => typeof x === 'string').slice(0, 1000) : null
    const apps = (await (await atsApplications())
      .find({ tenant_id: job.tenant_id, job_id: job.id, status: { $in: ['active', 'on_hold'] }, ...(only ? { id: { $in: only } } : {}) }, { projection: { _id: 0 } })
      .limit(1000)
      .toArray()) as AtsApplication[]
    const cands = new Map(
      ((await (await atsCandidates()).find({ tenant_id: job.tenant_id, id: { $in: apps.map((a) => a.candidate_id) } }, { projection: { _id: 0 } }).toArray()) as AtsCandidate[]).map((c) => [c.id, c]),
    )
    const screeningIds = new Set(job.pipeline.filter((s) => s.type === 'screening').map((s) => s.id))
    let rescored = 0
    let decided = 0
    for (const a of apps) {
      const c = cands.get(a.candidate_id)
      if (!c || (!c.resume?.text && !c.parsed)) continue
      const s = await screenCandidate(job, c)
      await (await atsApplications()).updateOne({ id: a.id, tenant_id: a.tenant_id }, { $set: { match: toMatch(s), updated_at: nowIso() } })
      rescored++
      if (screeningIds.has(a.stage_id) && !a.pending_move) {
        await recordStageResult(a.id, { stage_id: a.stage_id, outcome: s.passed ? 'pass' : 'fail', score: s.score, summary: `Rescreened: ${s.reasons.slice(0, 2).join('; ')}`, at: nowIso() })
        decided++
      }
    }
    await auditAts(g.actor, 'ats.job.rescreen', 'ats_job', job.id, `${rescored} rescored`, req)
    return json({ rescored, decided })
  } catch (e) {
    return errorResponse(e, 'rescreen POST')
  }
}
