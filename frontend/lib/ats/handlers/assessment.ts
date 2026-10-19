/**
 * Assessment stage: on entry, invite the candidate to the stage's exam
 * (createCandidateInvite, with the stage deadline) and wait. When the exam
 * submission is final (auto-graded at submit, or the last manual / AI grade
 * lands) onAssessmentScored maps it back to the waiting application by email
 * or user id and records pass/fail against the stage pass_score.
 *
 * The legacy per-test pipeline board (exam_submissions.pipeline_stage) is
 * untouched — both read the same submissions.
 */
import { registerStageHandler } from '../handlers'
import { recordStageResult, stageKey } from '../engine'
import { atsApplications, atsStageRuns, nowIso } from '../db'
import type { AtsApplication, AtsJob } from '../contract'

const DAY = 86_400_000

registerStageHandler({
  type: 'assessment',
  async onEnter({ app, job, candidate, stage, idempotencyKey }) {
    const cfg = stage.config?.kind === 'assessment' ? stage.config : null
    const pending = (summary: string) => recordStageResult(app.id, { stage_id: stage.id, outcome: 'pending', summary, at: nowIso() }, { entryKey: idempotencyKey })
    if (!cfg?.exam_id) return void (await pending('No assessment chosen for this stage'))
    if (!candidate.email) return void (await pending('The candidate has no email address to send the assessment to'))

    const { getMongoDb } = await import('@/lib/mongodb')
    const db = await getMongoDb()
    const exam = await db.collection('exams').findOne({ id: cfg.exam_id, tenant_id: job.tenant_id }, { projection: { _id: 0, id: 1, title: 1, tenant_id: 1 } })
    if (!exam) return void (await pending('The assessment for this stage no longer exists'))

    const deadline = new Date(Date.now() + (cfg.deadline_days ?? 7) * DAY).toISOString()
    const { createCandidateInvite } = await import('@/lib/services/invites')
    // The engine acts for the tenant: invites are tenant-scoped exactly like an admin's.
    const r = await createCandidateInvite(
      { id: 'ats-system', email: '', role: 'tenant_admin', tenantId: job.tenant_id, name: 'Hiring pipeline' },
      { email: candidate.email, full_name: candidate.name, target_url: `/assessment/${cfg.exam_id}`, exam_title: String(exam.title || job.title), expires_at: deadline },
    )
    if (!r.ok) {
      // Visible to the recruiter on the stage; the ledger row is marked failed too.
      await pending(`Could not send the assessment invite: ${String(r.error || 'unknown error').slice(0, 300)}. Fix it and move the candidate back into this stage, or send the test manually.`)
      throw new Error(`invite failed: ${r.error}`)
    }
    await (await atsStageRuns()).updateOne(
      { key: idempotencyKey },
      {
        $set: {
          status: 'waiting',
          exam_id: cfg.exam_id,
          email: candidate.email,
          user_id: (r.data.user?.id as string | null) || candidate.user_id || null,
          invite_id: r.data.invite_id,
          deadline,
          updated_at: nowIso(),
        },
      },
    )
    await pending(`Assessment sent — due by ${deadline.slice(0, 10)}`)
  },
})

const pct = (score: unknown, max: unknown): number | null => {
  const s = Number(score)
  const m = Number(max)
  return Number.isFinite(s) && Number.isFinite(m) && m > 0 ? Math.max(0, Math.min(100, Math.round((s / m) * 100))) : null
}

/**
 * Exam submission hook. Final (no pending manual review): records pass/fail.
 * Submitted but waiting for manual / AI grading: marks the waiting run
 * 'submitted' so the deadline sweep leaves it alone; the grading routes call
 * again with the final score. Safe to call more than once — recordStageResult
 * ignores a repeated identical result.
 */
export async function onAssessmentScored(sub: {
  id?: string
  exam_id: string
  user_id?: string | null
  email?: string | null
  score?: unknown
  max_score?: unknown
  has_pending_review?: boolean
}): Promise<number> {
  const email = typeof sub.email === 'string' ? sub.email.trim().toLowerCase() : ''
  const who = [...(email ? [{ email }] : []), ...(sub.user_id ? [{ user_id: String(sub.user_id) }] : [])]
  if (!who.length) return 0
  const runs = await atsStageRuns()
  if (sub.has_pending_review === true) {
    // Taken on time; the result follows when grading finishes.
    await runs.updateMany(
      { type: 'assessment', exam_id: sub.exam_id, status: 'waiting', $or: who },
      { $set: { status: 'submitted', updated_at: nowIso() } },
    )
    return 0
  }
  const score = pct(sub.score, sub.max_score)
  if (score === null) return 0
  const waiting = await runs.find({ type: 'assessment', exam_id: sub.exam_id, status: { $in: ['waiting', 'submitted'] }, $or: who }).limit(50).toArray()
  let applied = 0
  for (const run of waiting) {
    const app = (await (await atsApplications()).findOne({ id: run.application_id, tenant_id: run.tenant_id }, { projection: { _id: 0 } })) as AtsApplication | null
    if (!app || stageKey(app) !== run.key) {
      // The candidate already left that stage entry.
      await runs.updateOne({ key: run.key }, { $set: { status: 'done', updated_at: nowIso() } })
      continue
    }
    const { getMongoDb } = await import('@/lib/mongodb')
    const job = (await (await getMongoDb()).collection('ats_jobs').findOne({ id: app.job_id, tenant_id: app.tenant_id }, { projection: { _id: 0 } })) as AtsJob | null
    const stage = job?.pipeline.find((s) => s.id === run.stage_id)
    const passScore = stage?.config?.kind === 'assessment' ? stage.config.pass_score : 60
    // Claim the run: a concurrent hook (or the deadline sweep) that got here first wins.
    const claimed = await runs.updateOne({ key: run.key, status: { $in: ['waiting', 'submitted'] } }, { $set: { status: 'done', updated_at: nowIso() } })
    if (!claimed.matchedCount) continue
    await recordStageResult(app.id, {
      stage_id: run.stage_id,
      outcome: score >= passScore ? 'pass' : 'fail',
      score,
      summary: `Scored ${score}% (pass mark ${passScore}%)`,
      ...(sub.id ? { ref: { kind: 'exam_submission' as const, id: String(sub.id) } } : {}),
      at: nowIso(),
    }, { entryKey: run.key })
    applied++
  }
  return applied
}

/** Fire-and-forget wrapper for the exam routes (never throws, never blocks the response on errors). */
export function notifyAssessmentFinal(sub: Parameters<typeof onAssessmentScored>[0]): void {
  void onAssessmentScored(sub).catch((e) => console.error('[ats/assessment] result hook failed:', e))
}

/** Daily: assessments not taken by the deadline count as a fail ('submitted' runs — taken, awaiting grading — are skipped). */
export async function sweepAssessmentDeadlines(now = new Date()): Promise<number> {
  const runs = await atsStageRuns()
  const late = await runs.find({ type: 'assessment', status: 'waiting', deadline: { $lt: now.toISOString() } }).limit(1000).toArray()
  let n = 0
  for (const run of late) {
    const app = (await (await atsApplications()).findOne({ id: run.application_id, tenant_id: run.tenant_id }, { projection: { _id: 0 } })) as AtsApplication | null
    const r = await runs.updateOne({ key: run.key, status: 'waiting' }, { $set: { status: 'done', updated_at: nowIso() } })
    if (!r.matchedCount || !app || stageKey(app) !== run.key || app.status !== 'active') continue
    await recordStageResult(app.id, { stage_id: run.stage_id, outcome: 'fail', summary: 'Assessment not taken by the deadline', at: nowIso() }, { entryKey: run.key })
    n++
  }
  return n
}
