import { NextRequest, NextResponse } from 'next/server'
import {
  atsCollection,
  atsComments,
  canActOnStage,
  canSeeApplication,
  candidateViewFor,
  clientApplicationFilter,
  clientVisibleStageIds,
  getAccessSettings,
  parseId,
  requireAts,
  tenantFromRequest,
} from '@/lib/ats/access'
import type { AtsApplication, AtsCandidate, AtsInterview, AtsJob, StageType } from '@/lib/ats/contract'

type Ctx = { params: Promise<{ id: string }> }

/** Stage types whose results a client may read (bot screens can carry salary / notice answers). */
const CLIENT_RESULT_TYPES: ReadonlySet<StageType> = new Set(['screening', 'assessment', 'virtual_interview', 'f2f_interview', 'client_review', 'offer', 'hired'])

const PRIVATE_SUMMARY_TYPES: ReadonlySet<StageType> = new Set(['hr_round', 'bgv'])

const REC_WEIGHT = { strong_yes: 2, yes: 1, no: -1, strong_no: -2 } as const

/**
 * GET /api/ats/client/jobs/[id] — client review list: applications of this job at
 * client-visible stages with résumé summary, match, stage results, scorecard
 * summaries (no interviewer notes) and client-visible comments.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const id = parseId((await params).id)
  if (!id) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  const gate = await requireAts(['client'], tenantFromRequest(req))
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { actor } = gate
  try {
    const job = (await (await atsCollection<AtsJob>('jobs')).findOne({ id, tenant_id: actor.tenantId }, { projection: { _id: 0 } })) as AtsJob | null
    const filter = job ? clientApplicationFilter(actor, job) : null
    if (!job || !filter || job.status === 'draft') return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const settings = await getAccessSettings(actor.tenantId)
    const apps = ((await (await atsCollection<AtsApplication>('applications')).find(filter, { projection: { _id: 0 } }).sort({ stage_entered_at: -1 }).limit(300).toArray()) as AtsApplication[])
      .filter((a) => canSeeApplication(actor, a, job, { settings }))
    const appIds = apps.map((a) => a.id)
    const [candidates, interviews, comments] = appIds.length
      ? await Promise.all([
          (await atsCollection<AtsCandidate>('candidates')).find({ tenant_id: actor.tenantId, id: { $in: apps.map((a) => a.candidate_id) } }, { projection: { _id: 0 } }).toArray() as Promise<AtsCandidate[]>,
          (await atsCollection<AtsInterview>('interviews')).find({ tenant_id: actor.tenantId, application_id: { $in: appIds } }, { projection: { _id: 0, application_id: 1, stage_id: 1, mode: 1, status: 1, scheduled_at: 1, scorecards: 1 } }).toArray() as Promise<AtsInterview[]>,
          (await atsComments()).find({ tenant_id: actor.tenantId, application_id: { $in: appIds }, visibility: 'client' }, { projection: { _id: 0 } }).sort({ created_at: 1 }).limit(2000).toArray(),
        ])
      : [[], [], []]

    const stageById = new Map(job.pipeline.map((s) => [s.id, s]))
    const visibleIds = clientVisibleStageIds(job)
    const out = apps.map((a) => {
      const cand = candidates.find((c) => c.id === a.candidate_id)
      const stage = stageById.get(a.stage_id)
      return {
        id: a.id,
        stage: stage ? { id: stage.id, name: stage.name, type: stage.type } : { id: a.stage_id, name: a.stage_id, type: 'custom' },
        status: a.status,
        stage_entered_at: a.stage_entered_at,
        can_review: !!stage && canActOnStage(actor, stage) && a.status === 'active',
        pending_move: a.pending_move ? { to: stageById.get(a.pending_move.to)?.name || a.pending_move.to } : null,
        candidate: cand ? candidateViewFor(actor, cand, { settings }) : { id: a.candidate_id, name: 'Candidate' },
        match: a.match ? { score: a.match.score, reasons: a.match.reasons.slice(0, 6), missing_must: a.match.missing_must } : null,
        results: a.results
          .filter((r) => { const s = stageById.get(r.stage_id); return !!s && (CLIENT_RESULT_TYPES.has(s.type) || visibleIds.includes(s.id)) })
          // HR round / BGV summaries can carry compensation or verification detail: outcome only.
          .map((r) => ({ stage_name: stageById.get(r.stage_id)?.name || r.stage_id, outcome: r.outcome, score: r.score ?? null, summary: PRIVATE_SUMMARY_TYPES.has(stageById.get(r.stage_id)?.type as StageType) ? null : r.summary ?? null, at: r.at })),
        scorecards: interviews
          .filter((iv) => iv.application_id === a.id && (iv.scorecards || []).length)
          .map((iv) => {
            const cards = iv.scorecards || []
            const ratings = cards.flatMap((c) => Object.values(c.ratings || {})).filter((n) => typeof n === 'number')
            const tally = { strong_yes: 0, yes: 0, no: 0, strong_no: 0 }
            for (const c of cards) if (c.recommendation in tally) tally[c.recommendation]++
            const lean = cards.reduce((s, c) => s + (REC_WEIGHT[c.recommendation] ?? 0), 0)
            return {
              stage_name: stageById.get(iv.stage_id)?.name || iv.stage_id,
              mode: iv.mode,
              count: cards.length,
              avg_rating: ratings.length ? Math.round((ratings.reduce((x, y) => x + y, 0) / ratings.length) * 10) / 10 : null,
              recommendations: tally,
              lean: lean > 0 ? 'yes' : lean < 0 ? 'no' : 'mixed',
            }
          }),
        comments: comments.filter((c) => c.application_id === a.id),
      }
    })
    return NextResponse.json(
      {
        job: { id: job.id, title: job.title, location: job.location ?? null, work_mode: job.work_mode ?? null, openings: job.openings, status: job.status, description: job.description, skills: job.skills },
        stages: job.pipeline.filter((s) => visibleIds.includes(s.id)).map((s) => ({ id: s.id, name: s.name, type: s.type })),
        applications: out,
        contacts_visible: settings.client_sees_contacts,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (e) {
    console.error('[ats/client/jobs/[id]] GET failed:', e)
    return NextResponse.json({ error: 'Could not load candidates' }, { status: 500 })
  }
}
