import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { exams } from '@/lib/db/content'
import type { IdRouteContext } from '@/lib/app-route-context'
import { getMongoDb } from '@/lib/mongodb'
import { sanitizeExamQuestionList } from '@/lib/grading'
import { candidateExamView, isExamStaff, questionAnswerKey, pickFields, normalizeRetakeFields, attemptSummary, examAttemptPolicy, EXAM_EDITABLE_FIELDS } from '@/lib/exam-access'

export async function GET(_request: Request, { params }: IdRouteContext) {
  const gate = await requireAuth().catch(() => ({ error: 'Unauthorized' }))
  const { id } = await params
  try {
    const col = await exams()
    const doc = (await col.findOne({ id })) as Record<string, unknown> | null
    if (!doc) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

    const user = gate && !('error' in gate) ? gate.user : null

    // Graders (superadmin / own-tenant admin) get the full document.
    if (user && isExamStaff(user, doc)) return NextResponse.json(doc)

    // Drafts are invisible to everyone else.
    if (!doc.published) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

    // Anonymous callers get metadata only so the page can render the login prompt.
    if (!user) {
      return NextResponse.json({ ...candidateExamView(doc), questionList: [], questions: [], submission: null })
    }

    // Candidates: never the answer key, hidden tests or grader fields.
    // Grading happens server-side in POST /api/exams/[id]/submit.
    const view = candidateExamView(doc)
    const db = await getMongoDb()
    const submission = await db.collection('exam_submissions').findOne(
      { exam_id: id, user_id: user.id },
      { sort: { created_at: -1 } },
    )
    if (submission) {
      const released = !!submission.score_released
      // Attempts: latest + best, released scores only (never leak unreleased ones).
      const summary = attemptSummary(submission as Record<string, unknown>, doc, true)
      const attempts = {
        used: summary.attempt_no,
        max: summary.max_attempts,
        can_retake: examAttemptPolicy(doc).allowRetake && summary.attempt_no < summary.max_attempts,
        best: summary.best ? { score: summary.best.score, total: summary.best.max_score, attempt_no: summary.best.attempt_no } : null,
      }
      if (!released) {
        // Score and per-question correctness stay server-side until release.
        return NextResponse.json({ ...view, attempts, submission: { released: false, submitted_at: submission.submitted_at ?? null, attempt_no: summary.attempt_no } })
      }
      const qs = (Array.isArray(doc.questionList) ? doc.questionList : []) as Array<Record<string, unknown>>
      const keyById = new Map(qs.map((q) => [String(q.id), questionAnswerKey(q)]))
      const details = (Array.isArray(submission.details) ? submission.details : []).map(
        (d: Record<string, unknown>) => ({ ...d, correct_answer: keyById.get(String(d.qId)) }),
      )
      return NextResponse.json({
        ...view,
        attempts,
        submission: { released: true, score: submission.score, total: submission.max_score, details, attempt_no: summary.attempt_no },
      })
    }

    const { maxAttempts } = examAttemptPolicy(doc)
    return NextResponse.json({ ...view, attempts: { used: 0, max: maxAttempts, can_retake: true, best: null } })
  } catch (error) {
    console.error('[CodeSpectra] exams GET[id]:', error)
    return NextResponse.json({ error: 'Failed to load exam' }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const user = gate.user
  if (user.role !== 'superadmin' && user.role !== 'tenant_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  try {
    const col = await exams()
    const exam = await col.findOne({ id })
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    if (!isExamStaff(user, exam as unknown as Record<string, unknown>)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    // Allow-list: never id/_id/tenant_id/created_by or stats from the body.
    const data = pickFields(await request.json().catch(() => ({})), EXAM_EDITABLE_FIELDS)
    if (Object.keys(data).length === 0) return NextResponse.json({ error: 'No editable fields' }, { status: 400 })
    normalizeRetakeFields(data)
    // Same injection guard as PATCH /api/exams (see lib/grading.ts).
    if (Array.isArray(data.questionList)) {
      data.questionList = sanitizeExamQuestionList(data.questionList)
    }
    await col.updateOne({ id }, { $set: { ...data, updatedAt: new Date().toISOString() } })
    const updated = await col.findOne({ id })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('[CodeSpectra] exams PUT[id]:', error)
    return NextResponse.json({ error: 'Failed to update exam' }, { status: 400 })
  }
}
