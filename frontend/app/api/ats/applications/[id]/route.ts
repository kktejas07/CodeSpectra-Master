import { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { getMongoDb } from '@/lib/mongodb'
import { atsCandidates } from '@/lib/ats/db'
import { applicationViewFor, candidateViewFor, can, getAccessSettings, jobViewFor } from '@/lib/ats/access'
import { errorResponse, gate, json, loadApplication } from '@/lib/ats/http'
import type { AtsCandidate } from '@/lib/ats/contract'
import { publicInterview, type AtsInterviewDoc } from '@/lib/ats/interviews/db'
import { canSeeAllScorecards } from '@/lib/ats/interviews/access'
import { publicCall } from '@/lib/ats/screening/route-helpers'
import type { ScreeningCallDoc } from '@/lib/ats/screening/types'

/** GET /api/ats/applications/[id] → application + candidate (as the actor may see it), job, interviews, calls. */
export async function GET(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(req, 'application.view')
  if ('res' in g) return g.res
  try {
    const { actor } = g
    const { app, job } = await loadApplication(actor, (await params).id)
    const settings = await getAccessSettings(actor.tenantId)
    const cand = (await (await atsCandidates()).findOne({ id: app.candidate_id, tenant_id: actor.tenantId }, { projection: { _id: 0 } })) as AtsCandidate | null
    const db = await getMongoDb()
    const staff = actor.role !== 'client'
    const [interviews, calls] = await Promise.all([
      can(actor, 'interview.view')
        ? db.collection('ats_interviews')
            .find({ tenant_id: actor.tenantId, application_id: app.id, ...(actor.role === 'interviewer' ? { 'panel.user_id': actor.userId } : {}) }, { projection: { _id: 0 } })
            .sort({ created_at: -1 }).limit(50).toArray()
        : [],
      staff && actor.role !== 'interviewer'
        ? db.collection('ats_screening_calls').find({ tenant_id: actor.tenantId, application_id: app.id }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(20).toArray()
        : [],
    ])
    // Scorecards: interviewers see the others' cards (and the AI panel summary) only after submitting theirs.
    const ivs = (interviews as unknown as AtsInterviewDoc[]).map((iv) => {
      const seeAll = canSeeAllScorecards(actor, iv, job)
      const pub = publicInterview(iv, { showHost: staff })
      return {
        ...pub,
        scorecards: seeAll ? iv.scorecards : (iv.scorecards || []).filter((c) => c.interviewer_id === actor.userId),
        ai_summary: seeAll ? iv.ai_summary ?? null : null,
      }
    })
    return json({
      application: applicationViewFor(actor, app),
      candidate: cand ? candidateViewFor(actor, cand, { settings }) : null,
      job: jobViewFor(actor, job),
      interviews: ivs,
      calls: (calls as unknown as ScreeningCallDoc[]).map(publicCall),
      // Lets the UI show staff-only panels (compensation, HR round); the API enforces it.
      me: { role: actor.role },
    })
  } catch (e) {
    return errorResponse(e, 'application GET')
  }
}
