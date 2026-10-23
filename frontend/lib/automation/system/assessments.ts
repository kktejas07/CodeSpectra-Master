/**
 * Assessment automations:
 *   AU-01 / A-010  auto-grade coding (hidden tests via Piston) + written answers (AI) on submit
 *   AU-02 / A-007  finalise attempts the candidate left (deadline + grace) from the server draft
 *   AU-15 / A-013  plagiarism + leak + proctoring review when a test closes / every 25 submissions
 *   AU-08          submission receipts, organiser heads-ups, weekly results digest
 */
import type { Db, Document } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { emit } from '../events'
import { scheduleJob } from '../jobs'
import { sendAutomationEmail, tenantAdminUsers } from '../mailer'
import { claimOnce, nowIso } from '../store'
import { applyGrades, detailsToGrade, shouldFinalizeAttempt, type GradeDetail, type GradeOutcome } from './rules'
import type { SystemAutomation } from './types'

type Doc = Record<string, unknown>

const pct = (score: number, max: number) => (max > 0 ? Math.round((score / max) * 100) : 0)
const questionsOf = (exam: Doc) => (Array.isArray(exam.questionList) ? exam.questionList : Array.isArray(exam.questions) ? exam.questions : []) as Doc[]

// ─── AU-01: auto-grade ──────────────────────────────────────────────────────

const GRADE_TIMEOUT_MS = 60_000

export async function autoGradeSubmission(submissionId: string): Promise<{ graded: number; pending: boolean; final: boolean }> {
  const db = await getMongoDb()
  const sub = (await db.collection('exam_submissions').findOne({ id: submissionId }, { projection: { id_photo: 0, face_photo: 0 } })) as Doc | null
  if (!sub) return { graded: 0, pending: false, final: false }
  if (sub.score_released === true || sub.released_at) return { graded: 0, pending: false, final: true }
  const exam = (await db.collection('exams').findOne({ id: sub.exam_id })) as Doc | null
  if (!exam) return { graded: 0, pending: false, final: false }
  const details = (Array.isArray(sub.details) ? sub.details : []) as GradeDetail[]
  const todo = detailsToGrade(details)
  if (!todo.length && sub.has_pending_review !== true) return { graded: 0, pending: false, final: true }

  const { gradeAnswer, GradeRateLimitedError } = await import('@/lib/ai/grade-question')
  const { withTimeout } = await import('../backoff')
  const questions = questionsOf(exam)
  const results: Record<string, GradeOutcome> = {}
  let failures = 0
  for (const d of todo) {
    const q = questions.find((x) => String(x.id) === d.qId)
    if (!q) continue
    try {
      const r = await withTimeout(gradeAnswer({
        questionText: String(q.prompt || q.question || q.title || 'Question'),
        candidateAnswer: String(d.answer),
        modelAnswer: String(q.answer || q.correct_answer || '').trim(),
        type: String(q.type || ''),
        maxPoints: Number(q.points || q.score || d.points || 10),
        options: Array.isArray(q.options) ? q.options.map(String) : undefined,
        testCases: (q.test_cases || q.testCases) as { input: string; output: string }[] | undefined,
        tolerance: typeof q.tolerance === 'number' ? q.tolerance : undefined,
        pairs: Array.isArray(q.pairs) ? (q.pairs as never) : undefined,
        matrix: (q.matrix as never) || undefined,
        table: (q.table as never) || undefined,
        question: q,
      }), GRADE_TIMEOUT_MS, 'grading')
      results[d.qId] = { ...r, graded_by: r.graded_by ?? 'auto' }
    } catch (e) {
      failures++
      if (e instanceof GradeRateLimitedError) break // retry the rest later (job backoff)
    }
  }
  const applied = applyGrades(details, results)
  const set: Doc = { details: applied.details, score: applied.score, has_pending_review: applied.pending, auto_graded_at: nowIso() }
  if (!applied.pending) set.graded = true
  const upd = await db.collection('exam_submissions').updateOne({ id: submissionId, score_released: { $ne: true }, released_at: { $exists: false } }, { $set: set })
  if (!upd.matchedCount) return { graded: 0, pending: false, final: true }

  const final = !applied.pending
  const tenantId = (exam.tenant_id as string | null) ?? null
  if (final) {
    const { notifyAssessmentFinal } = await import('@/lib/ats/handlers/assessment')
    notifyAssessmentFinal({ id: submissionId, exam_id: String(sub.exam_id), user_id: String(sub.user_id), email: sub.email as string, score: applied.score, max_score: Number(sub.max_score), has_pending_review: false })
    void emit('exam.graded', {
      submission_id: submissionId, exam_id: sub.exam_id, exam_title: exam.title, user_id: sub.user_id, email: sub.email,
      score: applied.score, max_score: sub.max_score, percent: pct(applied.score, Number(sub.max_score)), graded_by: 'auto',
    }, { tenantId, idempotencyKey: `exam.graded:${submissionId}:${sub.attempt_no ?? 1}` })
    if (exam.auto_release_scores === true) await releaseSubmission(db, exam, { ...sub, ...set })
  } else if (applied.graded && (await claimOnce(`needs-review:${submissionId}`))) {
    // The AI flagged answers for a person: tell the organiser once.
    const owner = typeof exam.created_by === 'string' ? exam.created_by : null
    if (owner) {
      const { notify } = await import('@/lib/notifications')
      await notify({ user_id: owner, type: 'assessment.review_needed', title: `Answers to review in “${String(exam.title || 'your test')}”`, message: 'Auto-grading finished; some answers need a human check before results can be released.', link: `/dashboard/admin/assessments/${String(exam.id)}/results`, icon: 'clipboard-check' })
    }
  }
  if (failures && !final) throw new Error(`${failures} answer(s) could not be graded yet`)
  return { graded: applied.graded, pending: applied.pending, final }
}

/** Same effects as the admin "Release" button (pass mark, certificate, notices). */
async function releaseSubmission(db: Db, exam: Doc, sub: Doc): Promise<void> {
  const { examPassPercent } = await import('@/lib/exam-access')
  const { issueExamCertificate, deliverExamCertificate } = await import('@/lib/db/certifications')
  const { notifyResultsReleased } = await import('@/lib/exam-release-notify')
  const cutoff = examPassPercent(exam)
  const max = Number(sub.max_score)
  const p = max > 0 ? Math.max(0, Math.min(100, Math.round((Number(sub.score) / max) * 100))) : null
  const isPass = p !== null && p >= cutoff
  const ts = nowIso()
  const r = await db.collection('exam_submissions').updateOne({ id: sub.id, score_released: { $ne: true } }, { $set: { released_at: ts, score_released: true, passed: isPass, cutoff, released_by: 'automation' } })
  if (!r.modifiedCount) return
  try {
    const cert = await issueExamCertificate(db, exam, { ...sub, score_released: true, released_at: ts }, cutoff)
    if (cert) await deliverExamCertificate(exam, String(sub.user_id), cert)
  } catch (e) {
    console.error('[automation] auto-release certificate failed:', e)
  }
  await notifyResultsReleased(db, exam, sub)
}

// ─── AU-02: abandoned attempts ──────────────────────────────────────────────

export async function finalizeAbandonedAttempts(now = new Date(), limit = 100): Promise<{ finalized: number; checked: number }> {
  const db = await getMongoDb()
  const { attemptDeadlineMs, draftAccommodation, EXAM_SUBMIT_GRACE_MS, recordExamAttempt, getIdentityCheck, identitySummary } = await import('@/lib/exam-access')
  const { compareObjectiveAnswer } = await import('@/lib/grading')
  const { isScoredType, isDeterministicType } = await import('@/lib/question-types')
  const gradeExt = await import('@/lib/grading-extended')
  const drafts = (await db.collection('exam_drafts').find({
    attempt_started_at: { $gte: new Date(now.getTime() - 14 * 86_400_000).toISOString(), $lte: new Date(now.getTime() - EXAM_SUBMIT_GRACE_MS).toISOString() },
    $or: [{ submitted_at: { $exists: false } }, { submitted_at: null }],
    abandoned_checked_at: { $exists: false },
  }, { projection: { _id: 0 } }).sort({ attempt_started_at: 1 }).limit(limit).toArray()) as Doc[]
  const exams = new Map<string, Doc | null>()
  let finalized = 0
  // Extra 5 minutes past the grace so a slow final submit always wins.
  const SAFETY_MS = 5 * 60_000
  for (const draft of drafts) {
    const examId = String(draft.exam_id)
    const userId = String(draft.user_id)
    const attemptNo = Number(draft.attempt_no) || 1
    if (!exams.has(examId)) exams.set(examId, (await db.collection('exams').findOne({ id: examId })) as Doc | null)
    const exam = exams.get(examId)
    if (!exam) continue
    const deadline = attemptDeadlineMs(exam, String(draft.attempt_started_at), draftAccommodation(draft))
    const current = (await db.collection('exam_submissions').findOne({ exam_id: examId, user_id: userId })) as Doc | null
    const submittedForAttempt = !!current && (Number(current.attempt_no) || 1) >= attemptNo
    const answers = (draft.answers && typeof draft.answers === 'object' ? draft.answers : {}) as Record<string, unknown>
    const questions = questionsOf(exam)
    const qids = new Set(questions.map((q) => String(q.id)))
    const kept: Record<string, string> = {}
    for (const [k, v] of Object.entries(answers)) {
      if (!qids.has(k)) continue
      const s = Array.isArray(v) ? v.map((x) => String(x ?? '')).join(', ') : String(v ?? '')
      if (s.trim()) kept[k] = s.slice(0, 100_000)
    }
    if (!shouldFinalizeAttempt({ deadlineMs: deadline, graceMs: EXAM_SUBMIT_GRACE_MS + SAFETY_MS, submittedForAttempt, answeredCount: Object.keys(kept).length }, now)) {
      if (submittedForAttempt || deadline === null) {
        await db.collection('exam_drafts').updateOne({ exam_id: examId, user_id: userId, attempt_no: attemptNo }, { $set: { abandoned_checked_at: nowIso() } })
      }
      continue
    }
    // Nothing answered: leave it as "not submitted" (no zero score is invented).
    if (!Object.keys(kept).length) {
      await db.collection('exam_drafts').updateOne({ exam_id: examId, user_id: userId, attempt_no: attemptNo }, { $set: { abandoned_checked_at: nowIso() } })
      continue
    }
    let score = 0
    let max = 0
    let pendingAny = false
    const details = questions.map((q) => {
      const points = Number(q.points || q.score || 10)
      const scored = isScoredType(q.type)
      if (scored) max += points
      const a = String(kept[String(q.id)] || '').trim()
      let correct = false
      let pending = false
      const { gradeInstant } = gradeExt
      const instant = scored && a ? gradeInstant(q, a, points) : null
      if (instant) {
        if (instant.requires_human_review) { pending = true; pendingAny = true }
        score += instant.awarded
        return { qId: String(q.id), correct: instant.awarded > 0, points, answer: a, pending_review: pending, awarded: instant.awarded, remarks: instant.feedback, requires_human_review: !!instant.requires_human_review, graded_by: 'auto' }
      }
      if (scored && isDeterministicType(q.type)) {
        correct = compareObjectiveAnswer({ type: q.type as string, options: q.options as never, answer: String(q.answer ?? q.correct_answer ?? ''), tolerance: q.tolerance as never, pairs: q.pairs as never, matrix: q.matrix as never, table: q.table as never }, a).correct
      } else if (scored && a) {
        pending = true
        pendingAny = true
      }
      if (correct && scored) score += points
      return { qId: String(q.id), correct, points, answer: a, pending_review: pending }
    })
    const identity = await getIdentityCheck(db, examId, userId, attemptNo).catch(() => null)
    const user = (await db.collection('user').findOne({ id: userId }, { projection: { email: 1, name: 1, fullName: 1 } })) as Doc | null
    const email = String(user?.email || current?.email || '')
    const ts = nowIso()
    const { newId } = await import('../store')
    const submission: Doc = {
      id: newId(),
      exam_id: examId,
      user_id: userId,
      email,
      source: 'auto_finalized',
      extension_detected: false,
      answers: kept,
      score,
      max_score: max,
      has_pending_review: pendingAny,
      auto_submitted: true,
      late_submit: true,
      abandoned: true,
      id_photo: typeof identity?.id_photo === 'string' ? identity.id_photo : null,
      face_photo: typeof identity?.face_photo === 'string' ? identity.face_photo : null,
      identity_check: identitySummary(identity),
      details,
      ...(() => { const ts = gradeExt.traitScores(questions, kept); return ts.length ? { trait_scores: ts } : {} })(),
      device_info: null,
      question_timings: {},
      total_time_ms: deadline !== null ? Math.max(0, deadline - Date.parse(String(draft.attempt_started_at))) : 0,
      started_at: draft.attempt_started_at,
      deadline: deadline !== null ? new Date(deadline).toISOString() : null,
      submitted_at: ts,
      created_at: ts,
    }
    const stored = await recordExamAttempt(db, current && (Number(current.attempt_no) || 1) < attemptNo ? current : null, submission, attemptNo)
    if (!stored.ok) {
      await db.collection('exam_drafts').updateOne({ exam_id: examId, user_id: userId, attempt_no: attemptNo }, { $set: { abandoned_checked_at: nowIso() } })
      continue
    }
    finalized++
    await db.collection('exam_drafts').updateOne({ exam_id: examId, user_id: userId, attempt_no: attemptNo }, { $set: { answers: {}, submitted_at: ts, abandoned_checked_at: ts, finalized_by: 'automation' } })
    if (email) {
      await db.collection('candidate_invites').updateOne({ exam_id: examId, email: email.toLowerCase(), status: { $in: ['pending', 'active'] } }, { $set: { status: 'used', user_id: userId, updatedAt: ts } }).catch(() => {})
    }
    const tenantId = (exam.tenant_id as string | null) ?? null
    const { notifyAssessmentFinal } = await import('@/lib/ats/handlers/assessment')
    notifyAssessmentFinal({ id: String(submission.id), exam_id: examId, user_id: userId, email, score, max_score: max, has_pending_review: pendingAny })
    void emit('attempt.abandoned', { submission_id: submission.id, exam_id: examId, exam_title: exam.title, user_id: userId, email, answered: Object.keys(kept).length }, { tenantId, idempotencyKey: `attempt.abandoned:${examId}:${userId}:${attemptNo}` })
    void emit('exam.submitted', { submission_id: submission.id, exam_id: examId, exam_title: exam.title, user_id: userId, email, score, max_score: max, has_pending_review: pendingAny, auto_submitted: true, late_submit: true }, { tenantId, idempotencyKey: `exam.submitted:${submission.id}` })
    if (!pendingAny) void emit('exam.graded', { submission_id: submission.id, exam_id: examId, exam_title: exam.title, user_id: userId, email, score, max_score: max, percent: pct(score, max), graded_by: 'objective' }, { tenantId, idempotencyKey: `exam.graded:${submission.id}:${attemptNo}` })
    if (email) {
      await sendAutomationEmail({
        to: email, userId, category: 'assessment', onceKey: `abandoned:${examId}:${userId}:${attemptNo}`,
        subject: `We submitted your answers for ${String(exam.title || 'your test')}`,
        heading: 'Your answers were submitted for you',
        bodyText: `The time for “${String(exam.title || 'your test')}” ran out before you pressed Submit, so we submitted the ${Object.keys(kept).length} answer(s) that were saved. Nothing else is needed from you — you’ll hear when results are released.`,
        reason: 'You got this email because you started this test on CodeSpectra.',
        i18n: {
          subject: { key: 'auto.autoSubmit.subject', params: { title: String(exam.title || '') } },
          heading: { key: 'auto.autoSubmit.heading' },
          body: { key: 'auto.autoSubmit.body', params: { title: String(exam.title || ''), count: Object.keys(kept).length } },
          reason: { key: 'auto.autoSubmit.reason' },
        },
      })
    }
  }
  return { finalized, checked: drafts.length }
}

// ─── A-008 + AU-15: close tests, integrity review ───────────────────────────

/**
 * Queue an integrity review for tests that closed in the last 7 days. Closing
 * itself (A-008) runs in the shared scheduler (lib/platform-cron.ts), so this
 * looks at ends_at instead of the status flip and works whoever closed it.
 */
export async function queueClosedExamReviews(now = new Date()): Promise<{ reviewsQueued: number }> {
  const db = await getMongoDb()
  const nowStr = now.toISOString()
  const recent = (await db.collection('exams').find(
    { ends_at: { $lt: nowStr, $gte: new Date(now.getTime() - 7 * 86_400_000).toISOString() }, integrity_review_queued_at: { $exists: false } },
    { projection: { id: 1, tenant_id: 1 } },
  ).limit(50).toArray()) as Doc[]
  let queued = 0
  for (const e of recent) {
    const n = await db.collection('exam_submissions').countDocuments({ exam_id: e.id }, { limit: 2 })
    await db.collection('exams').updateOne({ id: e.id }, { $set: { integrity_review_queued_at: nowStr } })
    if (n < 2) continue
    if ((await scheduleJob('integrity_review', `integrity:${String(e.id)}:closed`, now, { exam_id: e.id, reason: 'test closed' }, { tenantId: (e.tenant_id as string) ?? null, maxAttempts: 3 })).created) queued++
  }
  return { reviewsQueued: queued }
}

/** Every 25 submissions on a live test, queue a review (event-driven). */
async function maybeQueueBatchReview(ev: { payload: Doc; tenant_id: string | null }): Promise<void> {
  const db = await getMongoDb()
  const examId = String(ev.payload.exam_id || '')
  if (!examId) return
  const n = await db.collection('exam_submissions').countDocuments({ exam_id: examId })
  if (n < 25 || n % 25 !== 0) return
  await scheduleJob('integrity_review', `integrity:${examId}:batch:${n}`, new Date(), { exam_id: examId, reason: `${n} submissions` }, { tenantId: ev.tenant_id, maxAttempts: 3 })
}

export async function runIntegrityReview(examId: string, reason: string): Promise<Doc> {
  const db = await getMongoDb()
  const exam = (await db.collection('exams').findOne({ id: examId }, { projection: { id: 1, title: 1, created_by: 1, tenant_id: 1 } })) as Doc | null
  if (!exam) return { skipped: 'exam gone' }
  const { detectPlagiarism } = await import('@/lib/proctoring/plagiarism-detector')
  const { detectLeaks } = await import('@/lib/proctoring/leak-detector')
  const { withTimeout } = await import('../backoff')
  const { isRiskProctorEvent } = await import('@/lib/exam-access')
  const [plagiarism, leaks] = await withTimeout(Promise.all([detectPlagiarism(examId), detectLeaks(examId)]), 180_000, 'integrity review')
  const checkedAt = nowIso()
  const report = {
    score: plagiarism.score,
    pairs: plagiarism.suspiciousPairs.length,
    aiFlags: plagiarism.aiGeneratedFlags.length,
    bankMatches: plagiarism.questionBankMatches.length,
    leaks: leaks.totalFlagged,
    checked_at: checkedAt,
    by: 'automation',
  }
  await db.collection('exams').updateOne({ id: examId }, { $set: { plagiarism_report: report } })

  // Proctoring: candidates with many risk events.
  const rows = (await db.collection('proctor_events').aggregate([
    { $match: { session_id: examId } },
    { $group: { _id: { u: '$user_id', t: '$event_type' }, n: { $sum: 1 } } },
  ]).toArray()) as { _id: { u: string; t: string }; n: number }[]
  const risk = new Map<string, number>()
  for (const r of rows) if (isRiskProctorEvent(r._id.t)) risk.set(r._id.u, (risk.get(r._id.u) || 0) + r.n)
  const flagged = new Set<string>([...risk.entries()].filter(([, n]) => n >= 5).map(([u]) => u))
  for (const p of plagiarism.suspiciousPairs) {
    flagged.add(p.userId1)
    flagged.add(p.userId2)
  }
  const owner = typeof exam.created_by === 'string' ? exam.created_by : null
  const summary = `${report.pairs} similar answer pair(s), ${report.aiFlags} likely AI-written answer(s), ${report.leaks} leaked-question match(es), ${flagged.size} candidate(s) to review (${reason}).`
  if (owner) {
    const ownerDoc = (await db.collection('user').findOne({ id: owner }, { projection: { email: 1 } })) as Doc | null
    const { notify } = await import('@/lib/notifications')
    await notify({ user_id: owner, type: 'assessment.integrity_report', title: `Integrity check: ${String(exam.title || 'your test')}`, message: summary, link: `/dashboard/admin/assessments/${examId}/results`, icon: 'shield' })
    if (ownerDoc?.email && (flagged.size || report.pairs || report.leaks)) {
      await sendAutomationEmail({
        to: String(ownerDoc.email), userId: owner, category: 'assessment', onceKey: `integrity:${examId}:${reason}`,
        subject: `Integrity check for ${String(exam.title || 'your test')}`,
        heading: 'Automatic integrity check finished',
        bodyText: `${summary}\n\nOpen the results page to see each flagged candidate before you release scores.`,
        cta: { label: 'Review results', url: `/dashboard/admin/assessments/${examId}/results` },
        reason: 'You get this because you organise this test.',
      })
    }
  }
  return { ...report, flagged: flagged.size }
}

// ─── AU-08: receipts, organiser heads-up, weekly digest ─────────────────────

async function onSubmitted(ev: { payload: Doc; tenant_id: string | null }): Promise<void> {
  const p = ev.payload
  const db = await getMongoDb()
  const exam = (await db.collection('exams').findOne({ id: p.exam_id }, { projection: { id: 1, title: 1, created_by: 1 } })) as Doc | null
  if (!exam) return
  if (p.email && !p.auto_submitted) {
    await sendAutomationEmail({
      to: String(p.email), userId: typeof p.user_id === 'string' ? p.user_id : null, category: 'assessment', onceKey: `receipt:${String(p.submission_id)}`,
      subject: `We received your answers for ${String(exam.title || 'your test')}`,
      heading: 'Submission received',
      bodyText: `Thanks — your answers for “${String(exam.title || 'your test')}” are safely stored. You’ll get an email when results are released.`,
      reason: 'You got this email because you submitted a test on CodeSpectra.',
      i18n: {
        subject: { key: 'auto.receipt.subject', params: { title: String(exam.title || '') } },
        heading: { key: 'auto.receipt.heading' },
        body: { key: 'auto.receipt.body', params: { title: String(exam.title || '') } },
        reason: { key: 'auto.receipt.reason' },
      },
    })
  }
  const owner = typeof exam.created_by === 'string' ? exam.created_by : null
  if (owner && (await claimOnce(`org-subs:${String(exam.id)}:${Math.floor(Date.now() / 3_600_000)}`))) {
    const since = new Date(Date.now() - 3_600_000).toISOString()
    const n = await db.collection('exam_submissions').countDocuments({ exam_id: exam.id, created_at: { $gte: since } })
    const { notify } = await import('@/lib/notifications')
    await notify({ user_id: owner, type: 'assessment.new_submissions', title: `New submissions on “${String(exam.title || 'your test')}”`, message: `${Math.max(1, n)} in the last hour.`, link: `/dashboard/admin/assessments/${String(exam.id)}/results`, icon: 'inbox', skip_push: true })
  }
}

export async function weeklyResultsDigest(now = new Date()): Promise<{ tenants: number }> {
  const db = await getMongoDb()
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString()
  const exams = (await db.collection('exams').find({ tenant_id: { $type: 'string' } }, { projection: { id: 1, title: 1, tenant_id: 1 } }).limit(5000).toArray()) as Doc[]
  const byTenant = new Map<string, Doc[]>()
  for (const e of exams) byTenant.set(String(e.tenant_id), [...(byTenant.get(String(e.tenant_id)) || []), e])
  let sent = 0
  const week = now.toISOString().slice(0, 10)
  for (const [tenantId, list] of byTenant) {
    const ids = list.map((e) => e.id)
    const [subs, pending, released] = await Promise.all([
      db.collection('exam_submissions').countDocuments({ exam_id: { $in: ids }, created_at: { $gte: since } }),
      db.collection('exam_submissions').countDocuments({ exam_id: { $in: ids }, has_pending_review: true }),
      db.collection('exam_submissions').countDocuments({ exam_id: { $in: ids }, released_at: { $gte: since } }),
    ])
    if (!subs && !pending) continue
    const admins = await tenantAdminUsers(tenantId)
    for (const a of admins) {
      await sendAutomationEmail({
        to: a.email, userId: a.id, category: 'assessment', onceKey: `weekly-results:${tenantId}:${a.id}:${week}`,
        subject: 'Your weekly test results summary',
        heading: 'This week in your tests',
        bodyText: `New submissions: ${subs}\nWaiting for review: ${pending}\nResults released: ${released}`,
        cta: { label: 'Open assessments', url: '/dashboard/admin/assessments' },
        reason: 'You get this weekly summary because you administer tests for your organisation.',
      })
    }
    sent++
  }
  return { tenants: sent }
}

// ─── Registry entries ───────────────────────────────────────────────────────

export const ASSESSMENT_AUTOMATIONS: SystemAutomation[] = [
  {
    id: 'auto-grade',
    title: 'Auto-grade coding and written answers',
    description: 'On submit, runs coding answers against the hidden test cases and AI-grades written answers, then updates the hiring pipeline. Answers the AI isn’t sure about stay for a person to review. Tests with “auto release” on release the score too.',
    group: 'Assessments',
    refs: ['AU-01', 'A-010'],
    events: [{
      type: 'exam.submitted',
      handle: async (ev) => {
        if (ev.payload.has_pending_review === true && ev.payload.submission_id) {
          await scheduleJob('auto_grade', `grade:${String(ev.payload.submission_id)}`, new Date(), { submission_id: ev.payload.submission_id }, { tenantId: ev.tenant_id, maxAttempts: 6 })
        }
      },
    }],
    jobs: [{ type: 'auto_grade', handler: async (p) => autoGradeSubmission(String(p.submission_id)) }],
  },
  {
    id: 'abandoned-attempts',
    title: 'Finish tests the candidate left',
    description: 'When an attempt’s time (plus grace) has passed without a submit, submits the answers saved on the server, scores them fairly, tells the candidate and updates the hiring stage.',
    group: 'Assessments',
    refs: ['AU-02', 'A-007'],
    cadence: { kind: 'interval', minutes: 5 },
    run: async (now) => finalizeAbandonedAttempts(now),
    // Finalising the attempt IS the event: with this off, nothing is finalised and nothing is emitted.
    emits: ['attempt.abandoned'],
  },
  {
    id: 'integrity-review',
    title: 'Automatic plagiarism and proctoring review',
    description: 'When a test closes (and every 25 submissions), checks for copied answers, leaked questions and heavy proctoring flags, saves the report and emails the organiser.',
    group: 'Assessments',
    refs: ['AU-15', 'A-013'],
    cadence: { kind: 'interval', minutes: 10 },
    run: async (now) => queueClosedExamReviews(now),
    events: [{ type: 'exam.submitted', handle: (ev) => maybeQueueBatchReview(ev) }],
    jobs: [{ type: 'integrity_review', handler: async (p) => runIntegrityReview(String(p.exam_id), String(p.reason || 'scheduled')) }],
  },
  {
    id: 'results-notifications',
    title: 'Submission receipts and results digest',
    description: 'Confirms receipt to candidates, gives organisers an hourly heads-up about new submissions, and emails organisation admins a weekly results summary (Mondays).',
    group: 'Assessments',
    refs: ['AU-08'],
    cadence: { kind: 'weekly', weekdayUtc: 1, hourUtc: 8 },
    run: async (now) => weeklyResultsDigest(now),
    events: [{ type: 'exam.submitted', handle: (ev) => onSubmitted(ev) }],
  },
]

export type { Document }
