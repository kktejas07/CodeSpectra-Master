import { NextRequest, NextResponse } from 'next/server'
import { requirePageAccess } from '@/lib/route-auth'
import { chargeAiFeature, outOfCredits } from '@/lib/user-credits'
import { getMongoDb } from '@/lib/mongodb'
import {
  parseResume, generateOpeningQuestion,
  type ParsedResume,
} from '@/lib/interviews/ai-mock-engine'
import { DEFAULT_MAX_TURNS, DEFAULT_MAX_DURATION } from '@/lib/interviews/ai-mock-types'
import { MAX_RESUME_CHARS, loadOwnResumeText, parseResumeRef, type ResumeRef } from '../_resume'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface StartBody {
  /** Ad-hoc text (pasted / PDF read in the browser). Ignored when `resume` is given. */
  resumeText?: string
  /** One of the caller's saved drafts or uploaded résumés, loaded on the server. */
  resume?: unknown
  role: string
  difficulty: string
  questionCount: number
}

export async function POST(req: NextRequest) {
  const gate = await requirePageAccess('/dashboard/interviews/ai-mock')
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const user = gate.user

  let body: StartBody
  try {
    body = (await req.json()) as StartBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const role = (body.role || '').trim()
  const difficulty = body.difficulty || 'intermediate'
  const maxTurns = Math.max(5, Math.min(15, body.questionCount || DEFAULT_MAX_TURNS))

  if (!role) {
    return NextResponse.json({ error: 'Role is required' }, { status: 400 })
  }

  if (!['beginner', 'intermediate', 'advanced', 'expert'].includes(difficulty)) {
    return NextResponse.json({ error: 'Invalid difficulty' }, { status: 400 })
  }

  // Résumé: a saved one is loaded by id (owner-checked) — never trust client text for it.
  const resumeRef = parseResumeRef(body.resume)
  if (resumeRef === null) return NextResponse.json({ error: 'Invalid resume selection' }, { status: 400 })
  let resumeText = ''
  let resumeSource: ResumeRef | null = null
  if (resumeRef) {
    let loaded: Awaited<ReturnType<typeof loadOwnResumeText>> = null
    try {
      loaded = await loadOwnResumeText(user.id, resumeRef)
    } catch (e) {
      console.error('[ai-mock] Resume load error:', e)
      return NextResponse.json({ error: 'Could not load that resume. Try again.' }, { status: 500 })
    }
    if (!loaded) {
      return NextResponse.json({ error: 'That resume is no longer available or has no text. Pick another one.' }, { status: 404 })
    }
    resumeText = loaded.text
    resumeSource = resumeRef
  } else if (typeof body.resumeText === 'string') {
    resumeText = body.resumeText.trim().slice(0, MAX_RESUME_CHARS)
  }

  // A mock interview is charged once, here; answers within the session are included.
  const charge = await chargeAiFeature(user.id, 'mock_interview')
  if (!charge.ok) return NextResponse.json(outOfCredits(charge), { status: 402 })

  // Parse resume if provided
  let resume: ParsedResume | null = null
  if (resumeText.length > 20) {
    try {
      resume = await parseResume(resumeText)
    } catch (e) {
      console.error('[ai-mock] Resume parse error:', e)
    }
  }

  // Generate opening question via conversational AI
  let opening: { greeting: string; question: string; category: string }
  try {
    opening = await generateOpeningQuestion(role, difficulty, resume)
  } catch (e) {
    console.error('[ai-mock] Opening question error:', e)
    opening = {
      greeting: `Hi! I'm excited to chat with you about this ${role} position. Let's get started.`,
      question: `Can you walk me through your experience with ${role.toLowerCase()} and what you're looking for in your next role?`,
      category: 'behavioral',
    }
  }

  const sessionId = `aimock_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  const now = Date.now()

  // Build the opening question as a Question object for the UI
  const firstQuestion = {
    id: `conv_q_${now}_0`,
    type: (['technical', 'behavioral', 'system-design'].includes(opening.category)
      ? opening.category
      : 'technical') as 'technical' | 'behavioral' | 'system-design',
    question: opening.question,
    difficulty,
    rubric: [] as string[],
    expectedPoints: [] as string[],
  }

  // Build conversation history with the AI's opening
  const conversationHistory = [
    { role: 'ai' as const, text: `${opening.greeting}\n\n${opening.question}`, timestamp: now, category: opening.category },
  ]

  // Store session in DB
  const sessionDoc = {
    id: sessionId,
    userId: user.id,
    role,
    difficulty,
    resume: resume || null,
    resumeSource: resumeSource ?? (resumeText ? { kind: 'text' } : null),
    conversationHistory,
    currentQuestion: { text: opening.question, category: opening.category, askedAt: now },
    scores: [],
    turnCount: 0,
    totalDuration: 0,
    maxTurns,
    maxDuration: DEFAULT_MAX_DURATION,
    status: 'active',
    startedAt: now,
    completedAt: null,
    report: null,
  }

  try {
    const db = await getMongoDb()
    await db.collection('ai_mock_sessions').insertOne(sessionDoc)
  } catch (e) {
    console.error('[ai-mock] DB insert error:', e)
    await charge.refund()
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }

  return NextResponse.json({
    sessionId,
    firstQuestion,
    totalQuestions: maxTurns,
    greeting: opening.greeting,
  })
}
