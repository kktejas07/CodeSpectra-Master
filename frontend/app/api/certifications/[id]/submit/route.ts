/**
 * POST /api/certifications/[id]/submit
 *
 * Body: { attempt_id: string, answers: Record<questionId, choiceIndex> }
 * Auth required. Scores the attempt, marks it submitted, and returns the
 * result (including verify token if the user passed).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import {
  certifications,
  certificationAttempts,
} from '@/lib/db/certifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface SubmitBody {
  attempt_id?: string
  answers?: Record<string, number>
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const body = (await req.json().catch(() => ({}))) as SubmitBody
  const attemptId = body.attempt_id
  const answers = body.answers || {}
  if (!attemptId) {
    return NextResponse.json({ error: 'attempt_id required' }, { status: 400 })
  }

  const certs = await certifications()
  const cert = await certs.findOne({ $or: [{ id }, { slug: id }] })
  if (!cert) return NextResponse.json({ error: 'Certification not found' }, { status: 404 })

  const attempts = await certificationAttempts()
  const attempt = await attempts.findOne({ id: attemptId, user_id: user.id })
  if (!attempt) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
  if (attempt.submitted_at) {
    return NextResponse.json(
      {
        already_submitted: true,
        score: attempt.score,
        passed: attempt.passed,
        verify_token: attempt.passed ? attempt.verify_token : null,
      },
      { status: 200 },
    )
  }

  // Score.
  const total = cert.questions.length || 1
  let correct = 0
  for (const q of cert.questions) {
    if (answers[q.id] === q.answer) correct += 1
  }
  const score = Math.round((correct / total) * 100)
  const passed = score >= cert.passing_score
  const submittedAt = new Date().toISOString()

  await attempts.updateOne(
    { id: attempt.id },
    { $set: { score, passed, submitted_at: submittedAt } },
  )

  return NextResponse.json({
    score,
    passed,
    correct,
    total,
    passing_score: cert.passing_score,
    verify_token: passed ? attempt.verify_token : null,
    submitted_at: submittedAt,
  })
}
