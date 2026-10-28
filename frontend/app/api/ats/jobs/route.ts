import { NextRequest } from 'next/server'
import { atsApplications, atsJobs } from '@/lib/ats/db'
import { createJob } from '@/lib/ats/jobs'
import { auditAts, isClientVisible, jobViewFor } from '@/lib/ats/access'
import { bodyOf, errorResponse, gate, jobScopeFilter, json } from '@/lib/ats/http'
import { limitRequest } from '@/lib/rate-limit'
import type { AtsApplication, AtsJob } from '@/lib/ats/contract'

/** GET /api/ats/jobs?status=&q= — jobs the actor can see, with per-stage counts. */
export async function GET(req: NextRequest) {
  const g = await gate(req, 'job.view')
  if ('res' in g) return g.res
  try {
    const scope = await jobScopeFilter(g.actor)
    if (!scope) return json({ jobs: [] })
    const sp = new URL(req.url).searchParams
    const status = sp.get('status')
    const q = (sp.get('q') || '').trim().slice(0, 80)
    const filter: Record<string, unknown> = { ...scope }
    if (status && ['draft', 'open', 'on_hold', 'closed', 'filled'].includes(status)) filter.status = status
    if (q) filter.title = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    const jobs = (await (await atsJobs()).find(filter, { projection: { _id: 0 } }).sort({ updated_at: -1 }).limit(500).toArray()) as AtsJob[]
    const ids = jobs.map((j) => j.id)
    const counts = ids.length
      ? await (await atsApplications())
          .aggregate<{ _id: { job: string; stage: string; status: string }; n: number }>([
            { $match: { tenant_id: g.actor.tenantId, job_id: { $in: ids } } },
            { $group: { _id: { job: '$job_id', stage: '$stage_id', status: '$status' }, n: { $sum: 1 } } },
          ])
          .toArray()
      : []
    const pending = ids.length
      ? await (await atsApplications())
          .aggregate<{ _id: { job: string; stage: string; status: string }; n: number }>([
            { $match: { tenant_id: g.actor.tenantId, job_id: { $in: ids }, pending_move: { $ne: null } } },
            { $group: { _id: { job: '$job_id', stage: '$stage_id', status: '$status' }, n: { $sum: 1 } } },
          ])
          .toArray()
      : []
    const client = g.actor.role === 'client'
    return json({
      jobs: jobs.map((j) => {
        // Clients only count what they can see (client-visible stages + hired).
        const seen = (c: { _id: { job: string; stage: string; status: string } }) =>
          c._id.job === j.id && (!client || isClientVisible({ stage_id: c._id.stage, status: c._id.status as AtsApplication['status'] }, j))
        const mine = counts.filter(seen)
        const sum = (f: (c: (typeof mine)[number]) => boolean) => mine.filter(f).reduce((a, c) => a + c.n, 0)
        return {
          ...(client ? { id: j.id, title: j.title, location: j.location, work_mode: j.work_mode, status: j.status, openings: j.openings, updated_at: j.updated_at } : j),
          counts: {
            total: sum(() => true),
            active: sum((c) => c._id.status === 'active' || c._id.status === 'on_hold'),
            hired: sum((c) => c._id.status === 'hired'),
            by_stage: Object.fromEntries((client ? jobViewFor(g.actor, j).pipeline : j.pipeline || []).map((s) => [s.id, sum((c) => c._id.stage === s.id && (c._id.status !== 'rejected' || s.type === 'rejected'))])),
          },
          pending_approvals: pending.filter(seen).reduce((a, p) => a + p.n, 0),
        }
      }),
    })
  } catch (e) {
    return errorResponse(e, 'jobs GET')
  }
}

/** POST /api/ats/jobs — create a job (default pipeline unless one is given). */
export async function POST(req: NextRequest) {
  const g = await gate(req, 'job.create')
  if ('res' in g) return g.res
  const limited = await limitRequest(req, 'ats-job-create', g.actor.userId, 30, 60_000)
  if (limited) return limited
  try {
    const job = await createJob(g.actor, await bodyOf(req))
    await auditAts(g.actor, 'ats.job.create', 'ats_job', job.id, job.title, req)
    return json({ job }, 201)
  } catch (e) {
    return errorResponse(e, 'jobs POST')
  }
}

