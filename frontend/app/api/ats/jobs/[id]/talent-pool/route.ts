import { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { talentPool } from '@/lib/ats/intake'
import { errorResponse, gate, json, loadJob } from '@/lib/ats/http'

/**
 * GET /api/ats/jobs/[id]/talent-pool?q=&limit= — suggested matches from this
 * organisation's own candidates and past job-board applicants (never other tenants').
 */
export async function GET(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(req, 'candidate.add')
  if ('res' in g) return g.res
  try {
    const job = await loadJob(g.actor, (await params).id)
    const sp = new URL(req.url).searchParams
    const entries = await talentPool(job, { q: (sp.get('q') || '').slice(0, 80), limit: Number(sp.get('limit')) || 30 })
    return json({ candidates: entries })
  } catch (e) {
    return errorResponse(e, 'talent-pool GET')
  }
}
