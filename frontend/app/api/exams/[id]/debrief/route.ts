/**
 * POST /api/exams/[id]/debrief
 *
 * Creates a post-assessment AI debrief session for the authenticated candidate.
 * Generates 3 contextual follow-up questions from the exam's question set and
 * the candidate's most-recent submission, then returns the session + first question.
 *
 * The exam must have `enable_ai_debrief: true`; also enforced server-side so
 * the browser cannot bypass it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { apiErrorFor } from '@/lib/api-errors'
import { isExamStaff } from '@/lib/exam-access'
import { nextDebriefQuestion, reopenDecision } from '@/lib/assessment/debrief'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ids'
import { limitRequest } from '@/lib/rate-limit'
import { backendComplete } from '@/lib/ai/backend'
import { modelJson } from '@/lib/ai/model-json'
import type { DebriefSessionDoc } from '@/lib/db/content'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** ponytail: 3 questions is the sweet spot — enough signal, short enough to complete. */
const DEBRIEF_QUESTION_COUNT = 3

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: examId } = await ctx.params

  const gate = await requireAuth().catch(() => null)
  if (!gate || 'error' in gate) {
    return NextResponse.json(apiErrorFor('sign_in_to_continue'), { status: 401 })
  }
  const userId = gate.user.id

  const limited = await limitRequest(req, 'debrief-create', userId, 10, 60 * 60_000)
  if (limited) return limited

  try {
    const db = await getMongoDb()

    // ── 1. Verify exam allows debrief ───────────────────────────────────────
    const exam = await db.collection('exams').findOne({ id: examId })
    if (!exam) return NextResponse.json(apiErrorFor('assessment_not_found'), { status: 404 })
    if (!exam.enable_ai_debrief) {
      return NextResponse.json(apiErrorFor('debrief_not_enabled'), { status: 403 })
    }

    // ── 2. The candidate's latest submission (a debrief is built from the exam's questions,
    //       so it is never available before or during an attempt) ───────────────────────
    const latestSub = await db.collection('exam_submissions').findOne(
      { exam_id: examId, user_id: userId },
      { sort: { submitted_at: -1 } },
    )
    if (!latestSub) {
      return NextResponse.json(apiErrorFor('debrief_submit_first'), { status: 403 })
    }
    const submissionId: string | null = latestSub.id ?? null

    // ── 3. One session per submission: resume it, reopen a skipped one, or show it as
    //       finished. A finished debrief is never replaced, so the recruiter keeps the answers.
    const sessionsCol = db.collection<DebriefSessionDoc>('exam_debrief_sessions')
    const existing = await sessionsCol.findOne(
      { exam_id: examId, user_id: userId, submission_id: submissionId },
      { sort: { created_at: -1 } },
    )
    if (existing) {
      const decision = reopenDecision(existing)
      if (decision === 'reopen') {
        await sessionsCol.updateOne({ id: existing.id }, { $set: { status: 'active', completed_at: null } })
      }
      return NextResponse.json({
        session_id: existing.id,
        question: decision === 'finished' ? null : nextDebriefQuestion(existing),
        total: existing.questions.length,
        answered: existing.answers.length,
      })
    }

    const questions: Array<{ id: string; text: string; type?: string }> = Array.isArray(exam.questions)
      ? (exam.questions as Array<{ id: string; text: string; type?: string }>).slice(0, 10)
      : []
    const answers: Record<string, string> = latestSub.answers ?? {}

    // ── 4. Generate debrief questions via AI ───────────────────────────────
    const questionSnippet = questions
      .map((q, i) => {
        const ans = String(answers[q.id] ?? '').slice(0, 400)
        return `Q${i + 1} [${q.type ?? 'question'}]: ${q.text.slice(0, 300)}${ans ? `\nCandidate answered: ${ans}` : ''}`
      })
      .join('\n\n')

    const system = `You are a technical interviewer reviewing a candidate's completed assessment for "${exam.title}".
Generate exactly ${DEBRIEF_QUESTION_COUNT} concise follow-up questions that probe the candidate's understanding and reasoning.
Focus on approach, trade-offs, and depth of thinking.
Return ONLY valid JSON: { "questions": ["question text 1", "question text 2", "question text 3"] }`

    const user = questions.length
      ? `Assessment: ${exam.title}\n\nQuestions the candidate answered:\n${questionSnippet}`
      : `Assessment: ${exam.title}\n\nGenerate ${DEBRIEF_QUESTION_COUNT} thoughtful follow-up questions about the candidate's overall approach and understanding.`

    const aiRes = await backendComplete({
      systemMessage: system,
      userMessage: user,
      responseFormat: 'json',
      modelRole: 'fast',
      feature: 'debrief-generate',
      userId,
      cache: false,
    })

    const parsed = modelJson(aiRes as Parameters<typeof modelJson>[0])
    const rawQs: string[] = Array.isArray(parsed?.questions) ? (parsed.questions as string[]).filter((s) => typeof s === 'string').slice(0, DEBRIEF_QUESTION_COUNT) : []

    // Fallback questions if AI unavailable
    const fallback = [
      'Walk me through your overall approach to this assessment.',
      'Which question did you find most challenging, and why?',
      'If you had more time, what would you revisit or improve?',
    ]
    const finalQs = rawQs.length >= DEBRIEF_QUESTION_COUNT ? rawQs : [...rawQs, ...fallback].slice(0, DEBRIEF_QUESTION_COUNT)

    const debriefQuestions = finalQs.map((text, i) => ({ id: newId(), text, order: i + 1 }))

    // ── 5. Persist session ─────────────────────────────────────────────────
    const session: DebriefSessionDoc = {
      id: newId(),
      exam_id: examId,
      submission_id: submissionId,
      user_id: userId,
      questions: debriefQuestions,
      answers: [],
      status: 'active',
      created_at: nowIso(),
    }
    await sessionsCol.insertOne(session)

    return NextResponse.json(
      { session_id: session.id, question: debriefQuestions[0], total: debriefQuestions.length, answered: 0 },
      { status: 201 },
    )
  } catch (e) {
    console.error('[debrief] create error', e)
    return NextResponse.json(apiErrorFor('debrief_start_failed'), { status: 500 })
  }
}

/**
 * GET — the caller's own session, or a candidate's (`?userId=`) when the caller
 * is staff for this exam (superadmin, or tenant_admin of the exam's tenant).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: examId } = await ctx.params
  const gate = await requireAuth().catch(() => null)
  if (!gate || 'error' in gate) return NextResponse.json(apiErrorFor('sign_in_to_continue'), { status: 401 })

  const targetUserId = req.nextUrl.searchParams.get('userId')
  const db = await getMongoDb()
  let userId = gate.user.id
  if (targetUserId && targetUserId !== gate.user.id) {
    // SEC: reading another person's debrief needs staff rights on THIS exam —
    // superadmin, or a tenant_admin of the exam's own tenant (lib/exam-access).
    const exam = await db.collection('exams').findOne({ id: examId }, { projection: { _id: 0, tenant_id: 1 } })
    if (!exam || !isExamStaff(gate.user, exam)) return NextResponse.json(apiErrorFor('not_found'), { status: 404 })
    userId = targetUserId
  }
  const sessions = await db.collection<DebriefSessionDoc>('exam_debrief_sessions')
    .find({ exam_id: examId, user_id: userId })
    .sort({ created_at: -1 })
    .limit(1)
    .toArray()

  return NextResponse.json({ session: sessions[0] ?? null })
}
