import { NextRequest, NextResponse } from 'next/server'
import { requireAts, tenantFromRequest } from '@/lib/ats/access'
import { atsApplications, atsCandidates, atsJobs } from '@/lib/ats/db'
import type { AtsApplication, AtsCandidate, AtsJob } from '@/lib/ats/contract'
import { atsInterviews, publicInterview } from '@/lib/ats/interviews/db'
import { canScheduleInterview, canViewInterview, onPanel } from '@/lib/ats/interviews/access'
import { createForStage, interviewConfig } from '@/lib/ats/interviews/service'
import { interviewErrorResponse, NO_STORE } from '@/lib/ats/interviews/http'
import { stageKey } from '@/lib/ats/engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ID = /^[A-Za-z0-9_-]{1,64}$/
const STATUSES = ['awaiting_schedule', 'scheduled', 'completed', 'no_show', 'cancelled'] as const

/**
 * GET /api/ats/interviews?scope=mine|all&application_id=&status= → { interviews }
 * mine (default without application_id): interviews with the caller on the panel.
 * all (default with application_id): every interview the caller may see (not for interviewers).
 */
export async function GET(req: NextRequest) {
  const gate = await requireAts([], tenantFromRequest(req))
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { actor } = gate
  if (actor.role === 'client') return NextResponse.json({ interviews: [], items: [] }, { headers: NO_STORE })
  try {
    const sp = new URL(req.url).searchParams
    const appId = sp.get('application_id')
    // By application: everything the caller may see for it; otherwise "mine" unless asked.
    const scope = (sp.get('scope') === 'all' || (appId && sp.get('scope') !== 'mine')) && actor.role !== 'interviewer' ? 'all' : 'mine'
    const status = sp.get('status')
    const filter: Record<string, unknown> = { tenant_id: actor.tenantId }
    if (scope === 'mine') filter['panel.user_id'] = actor.userId
    if (appId && ID.test(appId)) filter.application_id = appId
    if (status && (STATUSES as readonly string[]).includes(status)) filter.status = status
    const rows = await (await atsInterviews())
      .find(filter, { projection: { _id: 0 } })
      .sort({ scheduled_at: 1, created_at: -1 })
      .limit(300)
      .toArray()
    const jobIds = [...new Set(rows.map((r) => r.job_id))]
    const jobs = jobIds.length
      ? ((await (await atsJobs()).find({ tenant_id: actor.tenantId, id: { $in: jobIds } }, { projection: { _id: 0, id: 1, tenant_id: 1, client_id: 1, recruiter_ids: 1, hiring_manager_ids: 1, title: 1 } }).toArray()) as unknown as AtsJob[])
      : []
    const jobById = new Map(jobs.map((j) => [j.id, j]))
    const items = rows
      .filter((iv) => canViewInterview(actor, iv, jobById.get(iv.job_id) ?? null))
      .map((iv) => {
        const job = jobById.get(iv.job_id) ?? null
        const scheduler = canScheduleInterview(actor, iv, job)
        const p = publicInterview(iv, { showHost: scheduler || onPanel(actor, iv) })
        return {
          ...p,
          // list view: no scorecard contents
          scorecards: undefined,
          scorecard_count: iv.scorecards.length,
          my_scorecard_submitted: iv.scorecards.some((c) => c.interviewer_id === actor.userId),
          on_panel: onPanel(actor, iv),
          can_schedule: scheduler,
        }
      })
    return NextResponse.json({ interviews: items, items, scope }, { headers: NO_STORE })
  } catch (e) {
    return interviewErrorResponse(e, 'list')
  }
}

/** POST /api/ats/interviews { application_id } — open an interview for the application's current interview stage. */
export async function POST(req: NextRequest) {
  const gate = await requireAts(['admin', 'recruiter'], tenantFromRequest(req))
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { actor } = gate
  let body: { application_id?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const appId = typeof body.application_id === 'string' && ID.test(body.application_id) ? body.application_id : null
  if (!appId) return NextResponse.json({ error: 'application_id is required' }, { status: 400 })
  try {
    const app = (await (await atsApplications()).findOne({ id: appId, tenant_id: actor.tenantId }, { projection: { _id: 0 } })) as AtsApplication | null
    if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    const job = (await (await atsJobs()).findOne({ id: app.job_id, tenant_id: actor.tenantId }, { projection: { _id: 0 } })) as AtsJob | null
    if (!job || !canScheduleInterview(actor, { tenant_id: app.tenant_id }, job)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    const stage = job.pipeline.find((s) => s.id === app.stage_id)
    if (!stage || !interviewConfig(stage)) return NextResponse.json({ error: 'The candidate is not at an interview stage.' }, { status: 409 })
    if (app.status !== 'active' && app.status !== 'on_hold') return NextResponse.json({ error: 'This application is no longer active.' }, { status: 409 })
    const candidate = (await (await atsCandidates()).findOne({ id: app.candidate_id, tenant_id: actor.tenantId }, { projection: { _id: 0 } })) as AtsCandidate | null
    if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })

    // One open interview per stage entry; a new round after a cancellation gets its own key.
    const col = await atsInterviews()
    const open = await col.findOne({ tenant_id: actor.tenantId, application_id: app.id, stage_id: stage.id, status: { $in: ['awaiting_schedule', 'scheduled'] } }, { projection: { _id: 0 } })
    if (open) return NextResponse.json({ interview: publicInterview(open, { showHost: true }), existing: true })
    const base = stageKey(app)
    const taken = await col.countDocuments({ entry_key: { $regex: `^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } })
    const iv = await createForStage({ app, job, candidate, stage, idempotencyKey: taken ? `${base}:r${taken + 1}` : base }, actor.userId)
    if (!iv) return NextResponse.json({ error: 'Could not create the interview' }, { status: 500 })
    return NextResponse.json({ interview: publicInterview(iv, { showHost: true }) }, { status: 201 })
  } catch (e) {
    return interviewErrorResponse(e, 'create')
  }
}
