import { NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { attemptSummary, submissionSectionScores } from '@/lib/exam-access'
import { OUTCOMES_COLLECTION } from '@/lib/hiring-outcomes'
import { CAD_TASK_QID } from '@/lib/cad-submission'
import { mediaViewUrl } from '@/lib/identity-media'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id: examId, userId } = await params

  try {
    const db = await getMongoDb()

    const owned = await requireTenantEntity(db, 'exams', examId, gate.user)
    if ('error' in owned) {
      return NextResponse.json({ error: owned.error }, { status: owned.status })
    }
    const exam = owned.doc

    // Latest attempt (older attempts are archived; legacy rows may still have several).
    const submission = await db.collection('exam_submissions').findOne({ exam_id: examId, user_id: userId }, { sort: { created_at: -1 } })
    if (!submission) {
      // Exam exists but no submission — candidate may not have completed
      return NextResponse.json({
        examTitle: exam.title,
        questions: Array.isArray(exam.questionList) ? exam.questionList : (Array.isArray(exam.questions) ? exam.questions : []),
        submission: null,
        proctorEvents: [],
        candidate: { name: 'Unknown', email: '' },
      })
    }

    const events = await db.collection('proctor_events').find({
      user_id: userId,
      session_kind: 'exam',
      session_id: examId,
    }).sort({ created_at: 1 }).toArray()

    const user = await db.collection('user').findOne(
      { $or: [{ _id: userId as any }, { id: userId }] },
      { projection: { name: 1, fullName: 1, email: 1 } },
    )

    const baseQuestions = Array.isArray(exam.questionList) ? exam.questionList : (Array.isArray(exam.questions) ? exam.questions : [])
    // CAD attempts carry one manually graded item; show it as a question so
    // the existing review + "Save manual grades" flow scores it.
    const cad = submission.cad as { files?: unknown[]; rationale?: string; task_code?: string | null } | undefined
    const cadDetail = (submission.details || []).find((d: { qId?: string }) => d?.qId === CAD_TASK_QID) as { points?: number } | undefined
    const questions = cad
      ? [...baseQuestions, {
          id: CAD_TASK_QID,
          type: 'cad',
          title: 'CAD submission',
          prompt: `CAD task${cad.task_code ? ` (${cad.task_code})` : ''}: review the uploaded files and the design rationale below, then award points.`,
          points: cadDetail?.points,
        }]
      : baseQuestions
    const attempts = attemptSummary(submission as Record<string, unknown>, exam as Record<string, unknown>)
    const outcome = await db.collection(OUTCOMES_COLLECTION).findOne({ exam_id: examId, user_id: userId }, { projection: { _id: 0 } })

    return NextResponse.json({
      examTitle: exam.title,
      questions,
      cad: cad ? { files: Array.isArray(cad.files) ? cad.files : [], rationale: cad.rationale || '', task_code: cad.task_code ?? null } : null,
      attempts,
      submission: {
        answers: submission.answers || {},
        details: submission.details || [],
        score: submission.score ?? 0,
        max_score: submission.max_score ?? 0,
        has_pending_review: submission.has_pending_review ?? false,
        submitted_at: submission.submitted_at || submission.created_at || '',
        released_at: submission.released_at || null,
        // Loaded on demand for this one candidate: 5-minute signed URLs (lib/identity-media.ts).
        id_photo: await mediaViewUrl(submission.id_photo, gate.user.id),
        face_photo: await mediaViewUrl(submission.face_photo, gate.user.id),
        // Identity check summary: method, no-camera review flag, advisory face match.
        identity_check: submission.identity_check || null,
        // Timing data
        question_timings: submission.question_timings || {},
        total_time_ms: submission.total_time_ms || 0,
        started_at: submission.started_at || null,
        // Sectioned tests: per-section scores and the server's section clocks.
        section_scores: submissionSectionScores(exam as Record<string, unknown>, submission as Record<string, unknown>),
        section_timings: submission.section_timings || null,
      },
      outcome: outcome || null,
      proctorEvents: events.map((e: Record<string, unknown>) => ({
        event_type: e.event_type,
        meta: e.meta || {},
        created_at: e.created_at,
      })),
      candidate: {
        name: user?.fullName || user?.name || 'Unknown',
        email: user?.email || '',
      },
    })
  } catch (e: unknown) {
    const msg = 'Failed to load submission'
    console.error('[CodeSpectra] submission review GET:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** PATCH — Admin manual grading for coding/descriptive questions */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id: examId, userId } = await params
  const body = await request.json().catch(() => ({})) as {
    grades?: Record<string, number> // qId -> awarded points
    remarks?: Record<string, string> // qId -> feedback shown to candidate
  }

  if (!body.grades || typeof body.grades !== 'object') {
    return NextResponse.json({ error: 'grades object is required' }, { status: 400 })
  }

  try {
    const db = await getMongoDb()

    const owned = await requireTenantEntity(db, 'exams', examId, gate.user)
    if ('error' in owned) {
      return NextResponse.json({ error: owned.error }, { status: owned.status })
    }

    const submission = await db.collection('exam_submissions').findOne({ exam_id: examId, user_id: userId }, { sort: { created_at: -1 } })
    if (!submission) return NextResponse.json({ error: 'No submission found' }, { status: 404 })
    // Released scores already reached the candidate (pass/fail, certificate);
    // changing them silently would make those stale.
    if (submission.score_released === true || submission.released_at) {
      return NextResponse.json({ error: 'Results for this candidate are already released, so grades can’t be changed.' }, { status: 409 })
    }

    const details = (submission.details || []) as Array<{ qId: string; correct: boolean; points: number; answer: string; pending_review?: boolean; awarded?: number; requires_human_review?: boolean }>
    const reviewedAt = new Date().toISOString()

    let newScore = 0
    let stillPending = false
    const updatedDetails = details.map(d => {
      if (body.grades![d.qId] !== undefined) {
        const awarded = Math.max(0, Math.min(d.points, Number(body.grades![d.qId]) || 0))
        const remark = body.remarks?.[d.qId]
        // A human grade settles it: out of the SME queue too.
        const base = {
          ...d,
          awarded,
          correct: awarded > 0,
          pending_review: false,
          requires_human_review: false,
          reviewed_by: gate.user.id,
          reviewed_at: reviewedAt,
        }
        // Persist AI/admin feedback so it is shown to the candidate on release
        if (remark != null && String(remark).trim() !== '') {
          return { ...base, remarks: String(remark).trim() }
        }
        return base
      }
      if (d.pending_review) stillPending = true
      return d
    })

    for (const d of updatedDetails) {
      if (d.awarded !== undefined) {
        newScore += d.awarded
      } else if (d.correct) {
        newScore += d.points
      }
    }

    // By _id: grade exactly the attempt that was read (never an older row).
    await db.collection('exam_submissions').updateOne(
      { _id: submission._id },
      { $set: { details: updatedDetails, score: newScore, has_pending_review: stillPending } }
    )

    // Hiring pipeline: the last manual grade makes the attempt final.
    if (!stillPending) {
      import('@/lib/ats/handlers/assessment')
        .then(({ notifyAssessmentFinal }) => notifyAssessmentFinal({ id: submission.id, exam_id: String(submission.exam_id), user_id: String(submission.user_id), email: submission.email, score: newScore, max_score: submission.max_score, has_pending_review: false }))
        .catch((e) => console.error('[CodeSpectra] ats assessment hook:', e))
      void import('@/lib/automation/events').then(({ emit }) => emit('exam.graded', {
        submission_id: submission.id, exam_id: String(submission.exam_id), user_id: String(submission.user_id), email: submission.email, score: newScore, max_score: submission.max_score,
        percent: Number(submission.max_score) > 0 ? Math.round((newScore / Number(submission.max_score)) * 100) : 0, graded_by: 'manual',
      }, { tenantId: typeof owned.doc.tenant_id === 'string' ? owned.doc.tenant_id : null, idempotencyKey: `exam.graded:${String(submission.id)}:${String(submission.attempt_no ?? 1)}` })).catch((e) => console.error('[automation] emit failed:', e))
    }
    return NextResponse.json({ score: newScore, has_pending_review: stillPending })
  } catch (e: unknown) {
    const msg = 'Failed to save grades'
    console.error('[CodeSpectra] submission grade PATCH:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
