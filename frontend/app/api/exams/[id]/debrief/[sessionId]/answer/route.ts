/**
 * POST /api/exams/[id]/debrief/[sessionId]/answer
 *
 * Records the candidate's answer to the current debrief question and returns
 * the next question, or marks the session complete when all are answered.
 *
 * Body: { question_id: string; text: string }
 * Response: { done: false; question: { id, text, order } } | { done: true }
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
export const maxDuration = 30

/** Max characters per debrief answer — guards DB size. */
const MAX_ANSWER_LEN = 4000

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; sessionId: string }> },
) {
  const { id: examId, sessionId } = await ctx.params

  const gate = await requireAuth().catch(() => null)
  if (!gate || 'error' in gate) return NextResponse.json(apiErrorFor('sign_in_to_continue'), { status: 401 })
  const userId = gate.user.id

  const limited = await limitRequest(req, 'debrief-answer', userId, 30, 10 * 60_000)
  if (limited) return limited

  const body = await req.json().catch(() => ({})) as { question_id?: string; text?: string }
  const questionId = typeof body.question_id === 'string' ? body.question_id.trim() : ''
  const text = typeof body.text === 'string' ? body.text.slice(0, MAX_ANSWER_LEN).trim() : ''

  if (!questionId || !text) {
    return NextResponse.json(apiErrorFor('debrief_answer_required'), { status: 400 })
  }

  try {
    const db = await getMongoDb()
    const col = db.collection<DebriefSessionDoc>('exam_debrief_sessions')

    const session = await col.findOne({ id: sessionId, exam_id: examId, user_id: userId })
    if (!session) return NextResponse.json(apiErrorFor('debrief_session_not_found'), { status: 404 })
    if (session.status !== 'active') return NextResponse.json(apiErrorFor('debrief_session_closed'), { status: 409 })

    // Guard: question must exist and not already answered
    const question = session.questions.find((q: { id: string }) => q.id === questionId)
    if (!question) return NextResponse.json(apiErrorFor('debrief_question_missing'), { status: 400 })
    if (session.answers.some((a: { question_id: string }) => a.question_id === questionId)) {
      return NextResponse.json(apiErrorFor('assess_question_answered'), { status: 409 })
    }

    // Append the answer
    const newAnswer = { question_id: questionId, text, answered_at: nowIso() }
    const updatedAnswers = [...session.answers, newAnswer]
    const next = nextDebriefQuestion({ questions: session.questions, answers: updatedAnswers })

    await col.updateOne(
      // Guarded on the question still being unanswered, so a double submit can't add it twice.
      { id: sessionId, user_id: userId, status: 'active', 'answers.question_id': { $ne: questionId } },
      {
        $push: { answers: newAnswer },
        ...(next ? {} : { $set: { status: finalDebriefStatus(updatedAnswers), completed_at: nowIso() } }),
      },
    )

    if (!next) return NextResponse.json({ done: true })
    return NextResponse.json({ done: false, question: next, answered: updatedAnswers.length, total: session.questions.length })
  } catch (e) {
    console.error('[debrief] answer error', e)
    return NextResponse.json(apiErrorFor('debrief_save_failed'), { status: 500 })
  }
}
