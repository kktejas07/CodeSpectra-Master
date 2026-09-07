import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { generateConversationReport } from '@/lib/interviews/ai-mock-engine'
import type { ConversationMessage, ConversationSession } from '@/lib/interviews/ai-mock-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface CompleteBody {
  sessionId?: string
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
  const doc = await db.collection('ai_mock_sessions').findOne({ id: sessionId, userId: user.id })
  if (!doc) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  // Return cached report if already generated
  if (doc.report) {
    return NextResponse.json({ report: doc.report, sessionComplete: true })
  }

  // Build session object for report generation
  const session: ConversationSession = {
    id: doc.id,
    userId: doc.userId,
    role: doc.role,
    difficulty: doc.difficulty,
    resume: doc.resume || undefined,
    conversationHistory: Array.isArray(doc.conversationHistory) ? doc.conversationHistory as ConversationMessage[] : [],
    currentQuestion: doc.currentQuestion || null,
    scores: Array.isArray(doc.scores) ? doc.scores : [],
    turnCount: doc.turnCount || 0,
    totalDuration: doc.totalDuration || 0,
    maxTurns: doc.maxTurns || 10,
    maxDuration: doc.maxDuration || 1800,
    status: doc.status || 'active',
    startedAt: doc.startedAt,
    completedAt: doc.completedAt,
    report: doc.report || undefined,
  }

  // Generate report even with zero answers (partial session)
  let report
  try {
    report = await generateConversationReport(session)
  } catch (e) {
    console.error('[ai-mock] Report generation error:', e)
    const avgScore = session.scores.length > 0
      ? session.scores.reduce((s, e) => s + e.score, 0) / session.scores.length
      : 0
    const fallbackScore = Math.round(avgScore * 10)
    report = {
      overallScore: fallbackScore,
      category: fallbackScore >= 80 ? 'Strong' : fallbackScore >= 60 ? 'Competent' : 'Developing',
      summary: 'Report generation temporarily unavailable. Your scores are preserved above.',
      topStrengths: [],
      topImprovements: [],
      recommendedResources: [],
    }
  }

  // Mark session as completed
  await db.collection('ai_mock_sessions').updateOne(
    { id: sessionId, userId: user.id },
    { $set: { completedAt: Date.now(), status: 'completed', report } },
  )

  return NextResponse.json({ report, sessionComplete: true })
}
