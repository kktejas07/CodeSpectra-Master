/**
 * POST /api/exams/[id]/start — the candidate pressed Start (after the identity
 * and proctoring checks). Runs the same entry checks as submit, then records
 * the attempt start server-side (once per attempt; a reload or second device
 * resumes it) and returns the questions, the deadline and the server draft.
 *
 * Questions are only ever handed out here, so the clock is always running
 * while a candidate can read them.
 *
 * Body: { inviteToken?, linkToken? }
 * 403 { identity_required: true } — run POST ./identity first (per the test's settings).
 * 200: { questionList, started_at, deadline, server_now, answers, attempt_no,
 *        sections?, current_section_id? } — sectioned tests only hand out the
 *        questions of sections the candidate has entered (see ./section).
 * 410: { expired: true } — time is up; the page submits (the server finalises
 *      the attempt from the saved draft).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'
import { applySectionUpdate, attemptTimeState, candidateExamView, checkExamEntry, checkIdentityForAttempt, getExamDraft, startExamAttempt } from '@/lib/exam-access'
import { candidateSectionsView, resolveSections, visibleQuestionIds } from '@/lib/exam-sections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth().catch(() => null)
  if (!gate || 'error' in gate) {
    return NextResponse.json({ error: 'You must be signed in to take this assessment.' }, { status: 401 })
  }
  const { id: userId, email } = gate.user
  const { id: examId } = await ctx.params

  const rl = rateLimitSlidingWindow(`exam-start:${userId}:${examId}`, 30, 10 * 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const inviteToken = typeof body.inviteToken === 'string' ? body.inviteToken : null
  const linkToken = typeof body.linkToken === 'string' ? body.linkToken : null

  try {
    const db = await getMongoDb()
    const exam = (await db.collection('exams').findOne({ id: examId })) as Record<string, unknown> | null
    if (!exam || !exam.published) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

    let access = await checkExamEntry(db, exam, { id: userId, email }, { inviteToken, linkToken }, { claimLinkUse: true })
    if (!access.ok) {
      // Resuming an attempt that began before the window closed (its deadline
      // is capped at ends_at): allowed, a fresh start is not.
      const existing = await getExamDraft(db, examId, userId)
      const late = existing
        ? await checkExamEntry(db, exam, { id: userId, email }, { inviteToken, linkToken }, { ignoreWindowClose: true, claimLinkUse: true })
        : null
      if (!late || !late.ok || attemptTimeState(exam, existing, late.attemptNo).status === 'not_started') {
        return NextResponse.json({ error: access.error }, { status: access.status })
      }
      access = late
    }

    // Identity check (ID photo + face photo, or the no-camera upload) must be
    // stored for this attempt first — POST ./identity. Not skippable from here.
    const identity = await checkIdentityForAttempt(db, exam, userId, access.attemptNo)
    if (!identity.ok) {
      return NextResponse.json({ error: identity.error, identity_required: true }, { status: identity.status })
    }

    const draft = await startExamAttempt(db, examId, userId, access.attemptNo)
    const state = attemptTimeState(exam, draft, access.attemptNo)
    if (state.status === 'expired') {
      return NextResponse.json({ error: 'Time is up for this attempt.', expired: true }, { status: 410 })
    }
    if (state.status !== 'running') return NextResponse.json({ error: 'Could not start the test' }, { status: 500 })

    if (access.invite && inviteToken && access.invite.status === 'pending') {
      await db.collection('candidate_invites').updateOne(
        { token: inviteToken, status: 'pending' },
        { $set: { status: 'active', started_at: state.startedAt, updated_at: new Date().toISOString() } },
      ).catch(() => {})
    }

    const view = candidateExamView(exam)
    let questionList = (Array.isArray(view.questionList) ? view.questionList : (Array.isArray(view.questions) ? view.questions : [])) as Array<Record<string, unknown>>
    let answers = draft.answers && typeof draft.answers === 'object' ? draft.answers : {}
    let sectionFields: Record<string, unknown> = {}
    if (resolveSections(exam).length > 0) {
      // Section clocks: start (or resume) them on the server.
      const sec = await applySectionUpdate(db, exam, userId, access.attemptNo, { kind: 'sync' })
      if (!sec.ok) return NextResponse.json({ error: sec.error }, { status: sec.status })
      const visible = visibleQuestionIds(sec.sections, sec.state)
      questionList = questionList.filter((q) => visible.has(String(q.id)))
      answers = sec.answers
      sectionFields = { sections: candidateSectionsView(sec.sections, sec.state), current_section_id: sec.state.current }
    }
    return NextResponse.json({
      ok: true,
      questionList,
      started_at: state.startedAt,
      deadline: state.deadline !== null ? new Date(state.deadline).toISOString() : null,
      server_now: new Date().toISOString(),
      answers,
      attempt_no: access.attemptNo,
      max_attempts: access.maxAttempts,
      ...sectionFields,
    })
  } catch (e) {
    console.error('[exams/start] POST:', e)
    return NextResponse.json({ error: 'Could not start the test' }, { status: 500 })
  }
}
