import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { generateFluencyQuestions, type FluencyQuestion, type FluencyCategory } from '@/lib/assessments/ai-fluency-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface StartBody {
  focusCategories?: FluencyCategory[]
  difficulty?: string
  questionCount?: number
}

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: StartBody
  try {
    body = (await req.json()) as StartBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const difficulty = body.difficulty || 'intermediate'
  const questionCount = Math.max(5, Math.min(15, body.questionCount || 8))
  const validCats = new Set<string>(['prompt_engineering', 'ai_output_review', 'debugging_ai_code', 'ai_decision_making', 'prompt_chaining'])
  const focusCategories: FluencyCategory[] = Array.isArray(body.focusCategories) && body.focusCategories.length > 0
    ? body.focusCategories.filter((c): c is FluencyCategory => validCats.has(c))
    : ['prompt_engineering', 'ai_output_review', 'debugging_ai_code', 'ai_decision_making', 'prompt_chaining']

  if (!['beginner', 'intermediate', 'advanced', 'expert'].includes(difficulty)) {
    return NextResponse.json({ error: 'Invalid difficulty' }, { status: 400 })
  }

  let questions: FluencyQuestion[] = []
  try {
    questions = await generateFluencyQuestions(focusCategories, difficulty, questionCount)
  } catch (e) {
    console.error('[ai-fluency] Question generation error:', e)
    return NextResponse.json({ error: 'Failed to generate questions. Please try again.' }, { status: 502 })
  }

  if (questions.length === 0) {
    return NextResponse.json({ error: 'Failed to generate questions. Please try again.' }, { status: 502 })
  }

  const sessionId = `aifl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

  const sessionDoc = {
    id: sessionId,
    userId: user.id,
    focusCategories,
    difficulty,
    questionCount,
    questions,
    answers: [],
    startedAt: Date.now(),
    completedAt: null,
    report: null,
  }

  try {
    const db = await getMongoDb()
    await db.collection('ai_fluency_sessions').insertOne(sessionDoc)
  } catch (e) {
    console.error('[ai-fluency] DB insert error:', e)
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }

  return NextResponse.json({
    sessionId,
    firstQuestion: questions[0] || null,
    totalQuestions: questions.length,
    categories: focusCategories,
  })
}
