import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { processConversationTurn, wrapAsQuestion } from '@/lib/interviews/ai-mock-engine'
import type { ConversationMessage } from '@/lib/interviews/ai-mock-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface AnswerBody {
  sessionId: string
  answer: string
}

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: AnswerBody
  try {
    body = (await req.json()) as AnswerBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { sessionId, answer } = body

  if (!sessionId || typeof answer !== 'string') {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (answer.trim().length === 0) {
    return NextResponse.json({ error: 'Answer cannot be empty' }, { status: 400 })
  }
  if (answer.length > 10_000) {
    return NextResponse.json({ error: 'Answer is too long (max 10,000 characters).' }, { status: 400 })
  }

  const db = await getMongoDb()
  const doc = await db.collection('ai_mock_sessions').findOne({ id: sessionId, userId: user.id })
  if (!doc) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (doc.status !== 'active') {
    return NextResponse.json({ error: 'Session is no longer active' }, { status: 400 })
  }

  const turnCount = (doc.turnCount || 0) + 1
  const maxTurns = doc.maxTurns || 10
  const history = Array.isArray(doc.conversationHistory) ? doc.conversationHistory as ConversationMessage[] : []

  // Add candidate's answer to conversation history
  const candidateMsg: ConversationMessage = {
    role: 'candidate',
    text: answer.trim(),
    timestamp: Date.now(),
  }

  const updatedHistory = [...history, candidateMsg]

  // Process turn: evaluate answer + decide next question (single AI call)
  let turnResult
  try {
    turnResult = await processConversationTurn(
      updatedHistory,
      answer.trim(),
      doc.role,
      doc.difficulty,
      turnCount,
      maxTurns,
      doc.resume || undefined,
    )
  } catch (e) {
    console.error('[ai-mock] Turn processing error:', e)
    turnResult = {
      evaluation: { score: 5, strengths: [], improvements: ['Could not evaluate this answer'] },
      transition: 'Thank you for that answer.',
      nextQuestion: turnCount < maxTurns ? `Can you tell me more about your experience?` : null,
      category: 'technical',
      shouldEnd: turnCount >= maxTurns,
      endReason: turnCount >= maxTurns ? 'Maximum turns reached' : null,
    }
  }

  // Add AI's response to conversation history
  const aiText = turnResult.nextQuestion
    ? `${turnResult.transition}\n\n${turnResult.nextQuestion}`
    : turnResult.transition
  const aiMsg: ConversationMessage = {
    role: 'ai',
    text: aiText,
    timestamp: Date.now(),
    category: turnResult.category,
  }

  const finalHistory = [...updatedHistory, aiMsg]
  const shouldEnd = turnResult.shouldEnd || turnCount >= maxTurns

  // Build evaluation in the format the UI expects
  const evaluation = {
    score: turnResult.evaluation.score,
    strengths: turnResult.evaluation.strengths,
    improvements: turnResult.evaluation.improvements,
    followUp: null as string | null,
    detailedFeedback: turnResult.transition,
  }

  // Build the next question as a Question object for the UI (or null to end)
  const nextQuestion = turnResult.nextQuestion && !shouldEnd
    ? wrapAsQuestion(turnResult.nextQuestion, turnResult.category, doc.difficulty)
    : null

  // Update DB. `$push` is its own operator — nested inside `$set` it made the
  // whole write invalid, so no turn was ever saved.
  const updateFields: Record<string, unknown> = {
    conversationHistory: finalHistory,
    turnCount,
  }
  const scoreEntry = {
    score: turnResult.evaluation.score,
    strengths: turnResult.evaluation.strengths,
    improvements: turnResult.evaluation.improvements,
  }

  if (shouldEnd) {
    updateFields.status = 'completed'
    updateFields.completedAt = Date.now()
    updateFields.currentQuestion = null
  } else {
    updateFields.currentQuestion = {
      text: turnResult.nextQuestion || '',
      category: turnResult.category,
      askedAt: Date.now(),
    }
  }

  try {
    // Conditional on the turn we read, so a double submit can't record one turn twice.
    const res = await db.collection('ai_mock_sessions').updateOne(
      {
        id: sessionId,
        userId: user.id,
        status: 'active',
        ...(doc.turnCount ? { turnCount: doc.turnCount } : { $or: [{ turnCount: { $exists: false } }, { turnCount: 0 }] }),
      },
      { $set: updateFields, $push: { scores: scoreEntry } as never },
    )
    if (res.matchedCount === 0) {
      return NextResponse.json({ error: 'This answer was already recorded. Refresh to continue.' }, { status: 409 })
    }
  } catch (e) {
    console.error('[ai-mock] DB update error:', e)
    return NextResponse.json({ error: 'Could not save your answer. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({
    evaluation,
    nextQuestion,
    progress: {
      current: turnCount,
      total: maxTurns,
    },
    shouldEnd,
  })
}
