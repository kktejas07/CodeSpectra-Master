import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { generateFluencyReport, type FluencySession } from '@/lib/assessments/ai-fluency-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface CompleteBody {
  sessionId: string
}

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: CompleteBody
  try {
    body = (await req.json()) as CompleteBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { sessionId } = body
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
  }

  const db = await getMongoDb()
  const doc = await db.collection('ai_fluency_sessions').findOne({ id: sessionId, userId: user.id })
  if (!doc) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (doc.report) {
    return NextResponse.json({ report: doc.report, sessionComplete: true })
  }

  const session: FluencySession = {
    id: doc.id,
    userId: doc.userId,
    focusCategories: doc.focusCategories || [],
    difficulty: doc.difficulty,
    questionCount: doc.questionCount,
    questions: doc.questions || [],
    answers: doc.answers || [],
    startedAt: doc.startedAt,
    completedAt: doc.completedAt,
    report: doc.report || undefined,
  }

  let report
  try {
    report = await generateFluencyReport(session)
  } catch (e) {
    console.error('[ai-fluency] Report generation error:', e)
    const avgScore = session.answers.length > 0
      ? session.answers.reduce((s, a) => s + (a.evaluation?.score || 0), 0) / session.answers.length
      : 0
    report = {
      overallScore: Math.round(avgScore * 10),
      level: 'AI Developing',
      summary: 'Report generation temporarily unavailable. Your scores are preserved above.',
      categoryBreakdown: [],
      strongestCategory: 'N/A',
      weakestCategory: 'N/A',
      topStrengths: [],
      topImprovements: [],
      recommendations: [],
    }
  }

  await db.collection('ai_fluency_sessions').updateOne(
    { id: sessionId, userId: user.id },
    { $set: { completedAt: Date.now(), report } },
  )

  return NextResponse.json({ report, sessionComplete: true })
}
