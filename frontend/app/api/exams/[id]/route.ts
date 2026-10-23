import { NextResponse } from 'next/server'
import { requireAuth, isAdminCaller } from '@/lib/route-auth'
import { exams } from '@/lib/db/content'
import type { IdRouteContext } from '@/lib/app-route-context'
import { getMongoDb } from '@/lib/mongodb'
import { knowledgeOnTestChange } from '@/lib/rag/hooks'
import { sanitizeExamQuestionList } from '@/lib/grading'
import { candidateExamView, isExamStaff, questionAnswerKey, pickFields, normalizeRetakeFields, normalizeCertificateFields, normalizeProctoringFields, normalizeIdentityFields, normalizeSectionFields, attemptSummary, examAttemptPolicy, checkExamEntry, attemptTimeState, getExamDraft, EXAM_EDITABLE_FIELDS } from '@/lib/exam-access'

export async function GET(request: Request, { params }: IdRouteContext) {
  const gate = await requireAuth().catch(() => ({ error: 'Unauthorized', code: 'unauthorized' }))
  const { id } = await params
  try {
    const col = await exams()
    const doc = (await col.findOne({ id })) as Record<string, unknown> | null
    if (!doc) return NextResponse.json({ error: 'Exam not found', code: 'exam_not_found' }, { status: 404 })

    const user = gate && !('error' in gate) ? gate.user : null

    // Graders (superadmin / own-tenant admin) get the full document.
    if (user && isExamStaff(user, doc)) return NextResponse.json(doc)

    // Drafts are invisible to everyone else.
    if (!doc.published) return NextResponse.json({ error: 'Exam not found', code: 'exam_not_found' }, { status: 404 })

    // Candidates never get the answer key, hidden tests or grader fields, and
    // never get the questions from here: POST ./start hands them out once the
    // entry checks pass and the attempt clock is running.
    const view = candidateExamView(doc)
    const questionCount = Array.isArray(view.questionList) ? view.questionList.length : (Array.isArray(view.questions) ? view.questions.length : 0)
    const meta = { ...view, questionList: [], questions: [], question_count: questionCount }

    // Anonymous callers get metadata only so the page can render the login prompt.
    if (!user) return NextResponse.json({ ...meta, submission: null })

    const db = await getMongoDb()
    const url = new URL(request.url)
    const inviteToken = url.searchParams.get('inviteToken') || null
    const linkToken = url.searchParams.get('link') || null

    const submission = await db.collection('exam_submissions').findOne(
      { exam_id: id, user_id: user.id },
      { sort: { created_at: -1 } },
    )

    // Same entry checks as start/submit, so the page shows the real reason
    // (window, invite, link, attempts) before the candidate presses Start.
    // An attempt started before the window closed still has to be finalised
    // (its deadline is capped at ends_at), so report it rather than "closed".
    const draft = await getExamDraft(db, id, user.id)
    let access = await checkExamEntry(db, doc, { id: user.id, email: user.email }, { inviteToken, linkToken })
    if (!access.ok && draft) {
      const late = await checkExamEntry(db, doc, { id: user.id, email: user.email }, { inviteToken, linkToken }, { ignoreWindowClose: true })
      if (late.ok && attemptTimeState(doc, draft, late.attemptNo).status !== 'not_started') access = late
    }
    let entry: Record<string, unknown>
    if (access.ok) {
      const state = attemptTimeState(doc, draft, access.attemptNo)
      entry = {
        ok: true,
        attempt_no: access.attemptNo,
        attempt: state.status === 'not_started'
          ? { status: 'not_started' }
          : { status: state.status, started_at: state.startedAt, deadline: state.deadline !== null ? new Date(state.deadline).toISOString() : null },
      }
    } else {
      entry = { ok: false, error: access.error, status: access.status }
    }

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
        return NextResponse.json({ ...meta, entry, attempts, submission: { released: false, submitted_at: submission.submitted_at ?? null, attempt_no: summary.attempt_no } })
      }
      const qs = (Array.isArray(doc.questionList) ? doc.questionList : []) as Array<Record<string, unknown>>
      const keyById = new Map(qs.map((q) => [String(q.id), questionAnswerKey(q)]))
      const details = (Array.isArray(submission.details) ? submission.details : []).map(
        (d: Record<string, unknown>) => ({ ...d, correct_answer: keyById.get(String(d.qId)) }),
      )
      // Released results: the question texts (no keys) for the breakdown view.
      return NextResponse.json({
        ...view,
        question_count: questionCount,
        entry,
        attempts,
        submission: { released: true, score: submission.score, total: submission.max_score, details, attempt_no: summary.attempt_no, passed: typeof submission.passed === 'boolean' ? submission.passed : null },
      })
    }

    const { maxAttempts } = examAttemptPolicy(doc)
    return NextResponse.json({ ...meta, entry, attempts: { used: 0, max: maxAttempts, can_retake: true, best: null } })
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
  if (!isAdminCaller(user)) {
    return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
  }
  const { id } = await params
  try {
    const col = await exams()
    const exam = await col.findOne({ id })
    if (!exam) return NextResponse.json({ error: 'Exam not found', code: 'exam_not_found' }, { status: 404 })
    if (!isExamStaff(user, exam as unknown as Record<string, unknown>)) {
      return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
    }
    // Allow-list: never id/_id/tenant_id/created_by or stats from the body.
    const data = pickFields(await request.json().catch(() => ({})), EXAM_EDITABLE_FIELDS)
    if (Object.keys(data).length === 0) return NextResponse.json({ error: 'No editable fields' }, { status: 400 })
    normalizeRetakeFields(data)
    normalizeCertificateFields(data)
    normalizeProctoringFields(data)
    normalizeIdentityFields(data)
    normalizeSectionFields(data)
    // Same injection guard as PATCH /api/exams (see lib/grading.ts).
    if (Array.isArray(data.questionList)) {
      data.questionList = sanitizeExamQuestionList(data.questionList)
    }
    await col.updateOne({ id }, { $set: { ...data, updatedAt: new Date().toISOString() } })
    knowledgeOnTestChange(id, (exam as { tenant_id?: unknown }).tenant_id)
    const updated = await col.findOne({ id })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('[CodeSpectra] exams PUT[id]:', error)
    return NextResponse.json({ error: 'Failed to update exam' }, { status: 400 })
  }
}
