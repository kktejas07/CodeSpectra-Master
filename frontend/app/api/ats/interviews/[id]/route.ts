import { NextRequest, NextResponse } from 'next/server'
import { auditAts, candidateViewFor, requireAts, tenantFromRequest } from '@/lib/ats/access'
import { atsJobs } from '@/lib/ats/db'
import type { AtsJob, MeetingProvider } from '@/lib/ats/contract'
import { publicInterview } from '@/lib/ats/interviews/db'
import { canScheduleInterview, canSeeAllScorecards, canViewInterview, onPanel } from '@/lib/ats/interviews/access'
import {
  cancelInterview, candidateLink, getInterview, InterviewError, loadContext, scheduleInterview, setOutcomeStatus, updatePanel,
} from '@/lib/ats/interviews/service'
import { isMeetingProvider } from '@/lib/ats/interviews/providers'
import { interviewErrorResponse, NO_STORE } from '@/lib/ats/interviews/http'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function loadJob(tenantId: string, jobId: string): Promise<AtsJob | null> {
  return (await (await atsJobs()).findOne({ id: jobId, tenant_id: tenantId }, { projection: { _id: 0 } })) as AtsJob | null
}

/** GET — interview detail: candidate summary (role-redacted), scorecard template, scorecards the caller may see. */
export async function GET(req: NextRequest, { params }: Ctx) {
  const gate = await requireAts([], tenantFromRequest(req))
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { actor } = gate
  const { id } = await params
  try {
    const iv = await getInterview(actor.tenantId, id)
    if (!iv) return NextResponse.json({ error: 'Interview not found' }, { status: 404 })
    const { app, job, candidate } = await loadContext(iv)
    if (!canViewInterview(actor, iv, job)) return NextResponse.json({ error: 'Interview not found' }, { status: 404 })
    const scheduler = canScheduleInterview(actor, iv, job)
    const seeAll = canSeeAllScorecards(actor, iv, job)
    const names = new Map(iv.panel.map((p) => [p.user_id, p.name || p.email]))
    const scorecards = (seeAll ? iv.scorecards : iv.scorecards.filter((c) => c.interviewer_id === actor.userId))
      .map((c) => ({ ...c, interviewer_name: names.get(c.interviewer_id) || 'Former panel member' }))
    const pub = publicInterview(iv, { showHost: scheduler || onPanel(actor, iv) })
    const selfLink = scheduler && iv.self_schedule && iv.status === 'awaiting_schedule' ? await candidateLink(iv, 'sched') : null
    return NextResponse.json({
      interview: { ...pub, scorecards, ai_summary: seeAll ? iv.ai_summary ?? null : null },
      candidate: candidate ? candidateViewFor(actor, candidate, { interviewerAssigned: onPanel(actor, iv) }) : null,
      application: app ? {
        id: app.id,
        stage_id: app.stage_id,
        status: app.status,
        match: app.match ? { score: app.match.score, reasons: app.match.reasons?.slice(0, 6) || [] } : null,
        results: (app.results || []).map((r) => ({ stage_id: r.stage_id, outcome: r.outcome, score: r.score ?? null, summary: r.summary || null, at: r.at })),
      } : null,
      job: job ? { id: job.id, title: job.title, stages: job.pipeline.map((s) => ({ id: s.id, name: s.name, type: s.type })) } : null,
      self_schedule_link: selfLink,
      me: {
        user_id: actor.userId,
        role: actor.role,
        on_panel: onPanel(actor, iv),
        can_schedule: scheduler,
        can_score: onPanel(actor, iv),
        sees_all_scorecards: seeAll,
      },
    }, { headers: NO_STORE })
  } catch (e) {
    return interviewErrorResponse(e, 'detail')
  }
}

/**
 * PATCH { action, … }
 *  schedule | reschedule: { scheduled_at, duration_min?, provider?, manual_url?, location?: {address, room, map_url, instructions}, timezone? }
 *  cancel: { reason? }   complete   no_show   panel: { user_ids: string[] }
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const gate = await requireAts(['admin', 'recruiter'], tenantFromRequest(req))
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { actor } = gate
  const limited = await limitRequest(req, 'ats-interview-patch', actor.userId, 30, 60_000)
  if (limited) return limited
  const { id } = await params
  let body: Record<string, unknown>
  try {
    const raw = await req.json()
    body = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  try {
    const iv = await getInterview(actor.tenantId, id)
    if (!iv) return NextResponse.json({ error: 'Interview not found' }, { status: 404 })
    const job = await loadJob(actor.tenantId, iv.job_id)
    if (!canScheduleInterview(actor, iv, job)) return NextResponse.json({ error: "Your hiring role can't change this interview" }, { status: 403 })

    const action = body.action
    let out
    switch (action) {
      case 'schedule':
      case 'reschedule': {
        if (typeof body.scheduled_at !== 'string') throw new InterviewError(400, 'Pick a date and time.')
        const provider = body.provider === undefined ? undefined : isMeetingProvider(body.provider) ? (body.provider as MeetingProvider) : null
        if (provider === null) throw new InterviewError(400, 'Unknown meeting type.')
        const loc = body.location && typeof body.location === 'object' && !Array.isArray(body.location) ? (body.location as Record<string, string>) : null
        out = await scheduleInterview(actor, iv.id, actor.tenantId, {
          scheduled_at: body.scheduled_at,
          duration_min: typeof body.duration_min === 'number' ? body.duration_min : undefined,
          provider,
          manual_url: typeof body.manual_url === 'string' ? body.manual_url : undefined,
          location: loc,
          timezone: typeof body.timezone === 'string' ? body.timezone : undefined,
        })
        break
      }
      case 'cancel':
        out = await cancelInterview(iv.id, actor.tenantId, typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : null)
        break
      case 'complete':
        out = await setOutcomeStatus(iv.id, actor.tenantId, 'completed')
        break
      case 'no_show':
        out = await setOutcomeStatus(iv.id, actor.tenantId, 'no_show')
        break
      case 'panel': {
        const ids = Array.isArray(body.user_ids) ? body.user_ids.filter((x): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(x)) : []
        out = await updatePanel(iv.id, actor.tenantId, ids)
        break
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
    await auditAts(actor, `ats.interview.${String(action)}`, 'ats_interview', iv.id, undefined, req).catch(() => {})
    return NextResponse.json({ interview: publicInterview(out, { showHost: true }) })
  } catch (e) {
    return interviewErrorResponse(e, 'update')
  }
}
