/**
 * GET /api/ats/jobs/[id]/best-matches — learners who opted in to talent
 * discovery, ranked by an explainable match with this job (verified skills
 * weighted by level + location). Summary only; invite them via talent invites.
 */
import { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { errorResponse, gate, json, loadJob } from '@/lib/ats/http'
import { bestMatches, MatchError } from '@/lib/job-match/service'
import { apiErrorBody } from '@/lib/api-errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(req, 'candidate.add')
  if ('res' in g) return g.res
  try {
    const job = await loadJob(g.actor, (await params).id)
    return json(await bestMatches(g.actor, job, req))
  } catch (e) {
    if (e instanceof MatchError) return json(apiErrorBody(e.message, e.code), e.status)
    return errorResponse(e, 'best-matches GET')
  }
}
