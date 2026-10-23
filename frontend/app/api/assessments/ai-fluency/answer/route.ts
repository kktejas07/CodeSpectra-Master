import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { evaluateFluencyAnswer, FLUENCY_ANSWER_MAX_CHARS, type FluencyQuestion, type FluencyEvaluation } from '@/lib/assessments/ai-fluency-engine'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface AnswerBody {
  sessionId: string
  questionId: string
  answer: string
}

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  // SEC-032: every answer is an AI call — cap per user.
  const limited = await limitRequest(req, 'ai-fluency-answer', user.id, 20, 10 * 60_000)
  if (limited) return limited

  let body: AnswerBody
  try {
    body = (await req.json()) as AnswerBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
  }

  const { sessionId, questionId, answer } = body

  if (!sessionId || !questionId || typeof answer !== 'string') {
    return NextResponse.json({ error: 'Missing required fields', code: 'missing_fields' }, { status: 400 })
  }

  if (answer.trim().length === 0) {
    return NextResponse.json({ error: 'Answer cannot be empty', code: 'assess_answer_empty' }, { status: 400 })
  }
  if (answer.length > FLUENCY_ANSWER_MAX_CHARS) {
    return NextResponse.json({ error: `Keep your answer under ${FLUENCY_ANSWER_MAX_CHARS} characters.`, code: 'assess_answer_too_long', params: { max: FLUENCY_ANSWER_MAX_CHARS } }, { status: 400 })
  }

  const db = await getMongoDb()
  const session = await db.collection('ai_fluency_sessions').findOne({ id: sessionId, userId: user.id })
  if (!session) {
    return NextResponse.json({ error: 'Session not found', code: 'session_not_found' }, { status: 404 })
  }

  if (session.completedAt) {
    return NextResponse.json({ error: 'Session already completed', code: 'assess_session_completed' }, { status: 400 })
  }

  const questions = (session.questions || []) as FluencyQuestion[]
  const question = questions.find((q: FluencyQuestion) => q.id === questionId)
  if (!question) {
    return NextResponse.json({ error: 'Question not found in session', code: 'assess_question_not_in_session' }, { status: 400 })
  }
  // SEC-032: one graded answer per question (no re-grading loop on the AI budget).
  if (Array.isArray(session.answers) && session.answers.some((a: { questionId?: string }) => a?.questionId === questionId)) {
    return NextResponse.json({ error: 'You already answered this question.', code: 'assess_question_answered' }, { status: 409 })
  }

  let evaluation: FluencyEvaluation
  try {
    evaluation = await evaluateFluencyAnswer(question, answer)
  } catch (e) {
    console.error('[ai-fluency] Evaluation error:', e)
    evaluation = { score: 5, strengths: [], improvements: [], detailedFeedback: 'Evaluation temporarily unavailable.' }
  }

  const answerEntry = {
    questionId,
    answer: answer.trim(),
    evaluation,
    timestamp: Date.now(),
  }

  await db.collection('ai_fluency_sessions').updateOne(
    { id: sessionId, userId: user.id },
    { $push: { answers: answerEntry as any } },
  )

  const currentIdx = questions.findIndex((q: FluencyQuestion) => q.id === questionId)
  const nextIdx = currentIdx + 1
  const nextQuestion = nextIdx < questions.length ? questions[nextIdx] : null

  return NextResponse.json({
    evaluation,
    nextQuestion,
    progress: {
      current: nextIdx + 1,
      total: questions.length,
    },
  })
}
