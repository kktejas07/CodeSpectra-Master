/**
 * POST /api/exams/[id]/section — section navigation for a sectioned test.
 *
 * Body: { section_id?: string, answers?: Record<string, string | string[]> }
 *   section_id  go to this section (omit to just sync the clock)
 *   answers     the current section's answers, saved before the switch
 *               (answers for any other section are ignored)
 *
 * The server owns every section clock (lib/exam-sections.ts): a closed
 * section (time over, or locked after leaving) can't be entered or changed,
 * and when the current section's time ends the candidate is moved on.
 *
 * 200: { sections, current_section_id, questionList, answers, deadline, server_now }
 * 409: { error, sections?, current_section_id? } — closed section / no attempt / time up
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'
import { applySectionUpdate, candidateExamView, getExamDraft } from '@/lib/exam-access'
import { candidateSectionsView, visibleQuestionIds } from '@/lib/exam-sections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_ANSWER_CHARS = 100_000
const MAX_TOTAL_ANSWER_CHARS = 1_000_000

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth().catch(() => null)
  if (!gate || 'error' in gate) return NextResponse.json({ error: 'You must be signed in to take this assessment.' }, { status: 401 })
  const userId = gate.user.id
  const { id: examId } = await ctx.params

  const rl = rateLimitSlidingWindow(`exam-section:${userId}:${examId}`, 120, 10 * 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })

  const body = (await req.json().catch(() => ({}))) as { section_id?: unknown; answers?: unknown }
  const sectionId = typeof body.section_id === 'string' && body.section_id ? body.section_id.slice(0, 64) : null

  try {
    const db = await getMongoDb()
    const exam = (await db.collection('exams').findOne({ id: examId })) as Record<string, unknown> | null
    if (!exam || !exam.published) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

    // Same shape and caps as save-draft; unknown question ids dropped.
    let incoming: Record<string, string | string[]> | null = null
    if (body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)) {
      const qs = (Array.isArray(exam.questionList) ? exam.questionList : []) as Array<{ id?: unknown }>
      const ids = new Set(qs.map((q) => String(q.id)))
      incoming = {}
      let total = 0
      for (const [k, v] of Object.entries(body.answers as Record<string, unknown>)) {
        if (!ids.has(k)) continue
        const val = Array.isArray(v) ? v.slice(0, 100).map((x) => String(x ?? '').slice(0, 2000)) : String(v ?? '')
        const len = Array.isArray(val) ? val.join('').length : val.length
        if (len > MAX_ANSWER_CHARS) return NextResponse.json({ error: 'Answer too large' }, { status: 400 })
        total += len
        incoming[k] = val
      }
      if (total > MAX_TOTAL_ANSWER_CHARS) return NextResponse.json({ error: 'Draft too large' }, { status: 400 })
    }

    const draft = await getExamDraft(db, examId, userId)
    const attemptNo = Number(draft?.attempt_no) || 0
    if (!attemptNo) return NextResponse.json({ error: 'No attempt in progress.' }, { status: 409 })

    const op = sectionId ? { kind: 'enter' as const, sectionId } : { kind: 'sync' as const }
    const r = await applySectionUpdate(db, exam, userId, attemptNo, op, incoming)
    if (!r.ok) {
      return NextResponse.json({
        error: r.error,
        ...(r.sections && r.state ? { sections: candidateSectionsView(r.sections, r.state), current_section_id: r.state.current } : {}),
      }, { status: r.status })
    }

    const visible = visibleQuestionIds(r.sections, r.state)
    const view = candidateExamView(exam)
    const questionList = ((Array.isArray(view.questionList) ? view.questionList : []) as Array<Record<string, unknown>>)
      .filter((q) => visible.has(String(q.id)))
    return NextResponse.json({
      ok: true,
      sections: candidateSectionsView(r.sections, r.state),
      current_section_id: r.state.current,
      questionList,
      answers: r.answers,
      deadline: r.deadline !== null ? new Date(r.deadline).toISOString() : null,
      server_now: new Date().toISOString(),
    })
  } catch (e) {
    console.error('[exams/section] POST:', e)
    return NextResponse.json({ error: 'Could not change section' }, { status: 500 })
  }
}
