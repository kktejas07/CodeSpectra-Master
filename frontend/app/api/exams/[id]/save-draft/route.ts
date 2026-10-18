import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/ai'
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'
import { applySectionUpdate, attemptTimeState, getExamDraft } from '@/lib/exam-access'
import { resolveSections } from '@/lib/exam-sections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Same caps as the submit route (answers are stored verbatim).
const MAX_ANSWER_CHARS = 100_000
const MAX_TOTAL_ANSWER_CHARS = 1_000_000

/**
 * Server copy of the in-progress answers for the attempt started by
 * POST ./start. Only accepted while that attempt is running (deadline + grace);
 * if time runs out, submit finalises the attempt from this copy.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { id: examId } = await ctx.params
  const rl = rateLimitSlidingWindow(`exam-draft:${gate.user.id}:${examId}`, 120, 10 * 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })

  const body = await req.json().catch(() => ({})) as { answers?: unknown }
  if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) {
    return NextResponse.json({ error: 'answers object required' }, { status: 400 })
  }

  try {
    const db = await getMongoDb()
    const exam = await db.collection('exams').findOne({ id: examId }, { projection: { _id: 0, id: 1, duration: 1, ends_at: 1, questionList: 1, questions: 1, sections: 1 } })
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

    const draft = await getExamDraft(db, examId, gate.user.id)
    const attemptNo = Number(draft?.attempt_no) || 0
    const state = attemptTimeState(exam as Record<string, unknown>, draft, attemptNo)
    if (state.status !== 'running' || draft?.submitted_at) {
      return NextResponse.json({ error: state.status === 'expired' ? 'Time is up for this attempt.' : 'No attempt in progress.' }, { status: 409 })
    }

    const qs = (Array.isArray(exam.questionList) ? exam.questionList : Array.isArray(exam.questions) ? exam.questions : []) as Array<{ id?: unknown }>
    const ids = new Set(qs.map((q) => String(q.id)))
    const answers: Record<string, string | string[]> = {}
    let total = 0
    for (const [k, v] of Object.entries(body.answers as Record<string, unknown>)) {
      if (!ids.has(k)) continue
      const val = Array.isArray(v) ? v.slice(0, 100).map((x) => String(x ?? '').slice(0, 2000)) : String(v ?? '')
      const len = Array.isArray(val) ? val.join('').length : val.length
      if (len > MAX_ANSWER_CHARS) return NextResponse.json({ error: 'Answer too large' }, { status: 400 })
      total += len
      answers[k] = val
    }
    if (total > MAX_TOTAL_ANSWER_CHARS) return NextResponse.json({ error: 'Draft too large' }, { status: 400 })

    // Sectioned test: only the current, still-open section's answers are kept;
    // the section clock is applied (and saved) on the way.
    if (resolveSections(exam as Record<string, unknown>).length > 0) {
      const r = await applySectionUpdate(db, exam as Record<string, unknown>, gate.user.id, attemptNo, { kind: 'sync' }, answers)
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
      return NextResponse.json({ ok: true, saved_at: nowIso(), current_section_id: r.state.current })
    }

    // Only the running attempt's draft is written (a stale tab can't overwrite a retake).
    const res = await db.collection('exam_drafts').updateOne(
      { exam_id: examId, user_id: gate.user.id, attempt_no: attemptNo, submitted_at: { $exists: false } },
      { $set: { answers, updated_at: nowIso() } },
    )
    if (res.matchedCount === 0) return NextResponse.json({ error: 'No attempt in progress.' }, { status: 409 })

    return NextResponse.json({ ok: true, saved_at: nowIso() })
  } catch (e) {
    console.error('[save-draft] error:', e)
    return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 })
  }
}
