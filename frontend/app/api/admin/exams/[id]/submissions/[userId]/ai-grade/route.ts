import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { backendComplete } from '@/lib/ai/backend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST — AI-grade a coding/descriptive answer for one question.
 * Realtime assist for the admin reviewer: suggests a verdict, awarded points,
 * and remarks that will be shown to the candidate when the score is released.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id: examId, userId } = await params
  const body = await req.json().catch(() => ({})) as { qId?: string }

  if (!body.qId) {
    return NextResponse.json({ error: 'qId is required' }, { status: 400 })
  }

  try {
    const db = await getMongoDb()
    const exam = await db.collection('exams').findOne({ id: examId }, { projection: { questionList: 1, questions: 1 } })
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

    const questions = Array.isArray(exam.questionList) ? exam.questionList : (Array.isArray(exam.questions) ? exam.questions : [])
    const q = questions.find((x: any) => x.id === body.qId)
    if (!q) return NextResponse.json({ error: 'Question not found' }, { status: 404 })

    const submission = await db.collection('exam_submissions').findOne({ exam_id: examId, user_id: userId })
    if (!submission) return NextResponse.json({ error: 'No submission found' }, { status: 404 })

    const questionText = q.prompt || q.question || q.title || 'Question'
    const candidateAnswer = String((submission.answers || {})[body.qId] || '').trim()
    const modelAnswer = String(q.answer || q.correct_answer || '').trim()
    const maxPoints = q.points || q.score || 10

    if (!candidateAnswer) {
      return NextResponse.json({ error: 'Candidate provided no answer for this question' }, { status: 400 })
    }

    const isCoding = (q.type || '').toLowerCase().replace(/[-_]/g, '') === 'coding'

    const prompt = `You are a strict, fair technical examiner. Grade the candidate's ${isCoding ? 'code' : 'written'} answer against the model answer and the question.

QUESTION:
${questionText}

MODEL ANSWER / RUBRIC:
${modelAnswer || '(No model answer provided — judge based on the question and general correctness.)'}

MAX POINTS: ${maxPoints}

CANDIDATE'S ANSWER:
${candidateAnswer}

Respond ONLY as JSON with this exact shape:
{
  "awarded": <integer 0..${maxPoints}>,  // points justified by the answer
  "verdict": "correct" | "partial" | "incorrect",
  "feedback": "<2-4 sentences explaining where the answer went right/wrong, what is missing, and how to improve>"
}

Be strict but fair. Grade what is actually there, not potential. If it is code, check it actually compiles/runs and solves the task — note errors, edge cases missed, and correctness.`

    const res = await backendComplete({
      systemMessage: 'You are a strict, accurate technical examiner that grades candidate answers. Return only valid JSON.',
      userMessage: prompt,
      responseFormat: 'json',
    })

    if (!res.ok || !res.json) {
      return NextResponse.json({ error: 'AI grading failed. Try the manual grade input below.' }, { status: 502 })
    }

    const parsed = res.json as { awarded?: number; verdict?: string; feedback?: string }
    const awarded = Number(parsed.awarded)
    const recommended = Number.isFinite(awarded) ? Math.max(0, Math.min(maxPoints, Math.round(awarded))) : 0
    const feedback = String(parsed.feedback || '').trim()
    const verdict = ['correct', 'partial', 'incorrect'].includes(String(parsed.verdict)) ? parsed.verdict : (recommended >= maxPoints ? 'correct' : recommended > 0 ? 'partial' : 'incorrect')

    if (!feedback) {
      // The backend is configured as a non-reasoning gateway; if it omitted a
      // JSON object, report the raw text so the admin can still work.
      return NextResponse.json({ error: 'AI returned no structured feedback.' }, { status: 502 })
    }

    return NextResponse.json({
      qId: body.qId,
      awarded,
      recommended: awarded,
      max_points: maxPoints,
      verdict,
      feedback,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'AI grading failed'
    console.error('[CodeSpectra] ai-grade POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}