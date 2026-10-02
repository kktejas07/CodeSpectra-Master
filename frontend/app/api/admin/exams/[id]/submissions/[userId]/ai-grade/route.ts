import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { gradeAnswer } from '@/lib/ai/grade-question'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST — AI-grade one question for the admin reviewer.
 * Objective questions are graded deterministically (no LLM round-trip, so never
 * a 502); free-text answers (code/descriptive) use the configured LLM.
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
    const owned = await requireTenantEntity(db, 'exams', examId, gate.user)
    if ('error' in owned) {
      return NextResponse.json({ error: owned.error }, { status: owned.status })
    }
    const exam = owned.doc

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
      // No answer = automatic 0 — no LLM round-trip needed
      return NextResponse.json({
        qId: body.qId,
        awarded: 0,
        recommended: 0,
        max_points: maxPoints,
        verdict: 'incorrect',
        feedback: 'No answer provided.',
      })
    }

    const result = await gradeAnswer({
      questionText,
      candidateAnswer,
      modelAnswer,
      type: q.type || '',
      maxPoints,
      options: Array.isArray(q.options) ? q.options.map(String) : undefined,
      testCases: q.test_cases || q.testCases,
    })

    return NextResponse.json({
      qId: body.qId,
      awarded: result.recommended,
      recommended: result.recommended,
      max_points: maxPoints,
      verdict: result.verdict,
      feedback: result.feedback,
      jev_agree: result.jev_agree ?? null,
      jev_confidence: result.jev_confidence ?? null,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'AI grading failed'
    console.error('[CodeSpectra] ai-grade POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}