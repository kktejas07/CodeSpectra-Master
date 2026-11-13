/**
 * POST /api/exams/[id]/debrief/[sessionId]/skip
 *
 * Body `{ question_id }` — skip that one question and get the next one back
 *   → `{ done, question, answered, total }` (same shape as /answer).
 * No body — the candidate skipped the whole debrief → `{ ok: true, done: true }`.
 *   A session skipped this way can be reopened later (see ../../route.ts).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { apiErrorFor } from '@/lib/api-errors'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/ids'
import { limitRequest } from '@/lib/rate-limit'
import { finalDebriefStatus, nextDebriefQuestion } from '@/lib/assessment/debrief'
import type { DebriefSessionDoc } from '@/lib/db/content'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; sessionId: string }> },
) {
  const { id: examId, sessionId } = await ctx.params
  const gate = await requireAuth().catch(() => null)
  if (!gate || 'error' in gate) return NextResponse.json(apiErrorFor('sign_in_to_continue'), { status: 401 })

  const limited = await limitRequest(req, 'debrief-skip', gate.user.id, 30, 10 * 60_000)
  if (limited) return limited

  const body = await req.json().catch(() => ({})) as { question_id?: unknown }
  const questionId = typeof body.question_id === 'string' ? body.question_id.trim() : ''

  try {
    const db = await getMongoDb()
    const col = db.collection<DebriefSessionDoc>('exam_debrief_sessions')
    const own = { id: sessionId, exam_id: examId, user_id: gate.user.id }

    if (!questionId) {
      await col.updateOne({ ...own, status: 'active' }, { $set: { status: 'skipped', completed_at: nowIso() } })
      return NextResponse.json({ ok: true, done: true })
    }

    const session = await col.findOne(own)
    if (!session) return NextResponse.json(apiErrorFor('debrief_session_not_found'), { status: 404 })
    if (session.status !== 'active') return NextResponse.json(apiErrorFor('debrief_session_closed'), { status: 409 })
    if (!session.questions.some((q) => q.id === questionId)) return NextResponse.json(apiErrorFor('debrief_question_missing'), { status: 400 })
    if (session.answers.some((a) => a.question_id === questionId)) return NextResponse.json(apiErrorFor('assess_question_answered'), { status: 409 })

    const entry = { question_id: questionId, text: '', answered_at: nowIso(), skipped: true }
    const answers = [...session.answers, entry]
    const next = nextDebriefQuestion({ questions: session.questions, answers })
    await col.updateOne(
      // Guarded on the question still being unanswered, so a double click can't add it twice.
      { ...own, status: 'active', 'answers.question_id': { $ne: questionId } },
      { $push: { answers: entry }, ...(next ? {} : { $set: { status: finalDebriefStatus(answers), completed_at: nowIso() } }) },
    )
    return NextResponse.json({ done: !next, question: next, answered: answers.length, total: session.questions.length })
  } catch (e) {
    console.error('[debrief] skip error', e)
    return NextResponse.json(apiErrorFor('debrief_save_failed'), { status: 500 })
  }
}
