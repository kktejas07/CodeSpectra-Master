import { NextRequest } from 'next/server'
import { atsApplications, atsJobs } from '@/lib/ats/db'
import { computeAnalytics } from '@/lib/ats/analytics'
import { errorResponse, gate, idOk, jobScopeFilter, json } from '@/lib/ats/http'
import type { AtsApplication, AtsJob } from '@/lib/ats/contract'

/**
 * GET /api/ats/analytics?job_id=&since=YYYY-MM-DD — funnel per stage (reached,
 * current, conversion %, median days in stage), time-to-hire, source mix,
 * rejection reasons. Without job_id: every job the actor can see, by stage type.
 */
export async function GET(req: NextRequest) {
  const g = await gate(req, 'analytics.view')
  if ('res' in g) return g.res
  try {
    const sp = new URL(req.url).searchParams
    const jobId = sp.get('job_id')
    const since = sp.get('since')
    const scope = await jobScopeFilter(g.actor)
    if (!scope) return json({ error: 'Not allowed' }, 403)
    if (jobId && !idOk(jobId)) return json({ error: 'Job not found' }, 404)
    const jobs = (await (await atsJobs()).find({ ...scope, ...(jobId ? { id: jobId } : {}) }, { projection: { _id: 0 } }).limit(2000).toArray()) as AtsJob[]
    if (jobId && !jobs.length) return json({ error: 'Job not found' }, 404)
    const filter: Record<string, unknown> = { tenant_id: g.actor.tenantId, job_id: { $in: jobs.map((j) => j.id) } }
    if (since && /^\d{4}-\d{2}-\d{2}$/.test(since)) filter.created_at = { $gte: `${since}T00:00:00.000Z` }
    const apps = (await (await atsApplications())
      .find(filter, { projection: { _id: 0, id: 1, job_id: 1, stage_id: 1, status: 1, source: 1, history: 1, created_at: 1, rejection_reason: 1, candidate_id: 1, tenant_id: 1 } })
      .limit(50_000)
      .toArray()) as AtsApplication[]
    return json({ job_id: jobId || null, ...computeAnalytics(apps, jobs, { jobId }) })
  } catch (e) {
    return errorResponse(e, 'analytics GET')
  }
}
