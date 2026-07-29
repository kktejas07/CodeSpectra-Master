import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { id: examId } = await ctx.params
  const body = await req.json().catch(() => ({})) as {
    answers?: Record<string, string>
    auto_submitted?: boolean
    idPhoto?: string
    facePhoto?: string
  }

  try {
    const db = await getMongoDb()
    const exams = db.collection('exams')
    const exam = await exams.findOne({ id: examId })
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

    const questions = exam.questions || []
    const answers = body.answers || {}
    let totalScore = 0
    let maxScore = 0
    const details: Array<{ qId: string; correct: boolean; points: number; answer: string }> = []

    for (const q of questions) {
      const points = q.points || 10
      maxScore += points
      const userAnswer = (answers[q.id] || '').trim()

      // Simple grading: for MCQ, check exact match. For others, store for manual review.
      let correct = false
      if (q.type === 'multiple-choice' && q.correct_answer) {
        correct = userAnswer.toLowerCase() === String(q.correct_answer).toLowerCase()
      }

      if (correct) totalScore += points
      details.push({ qId: q.id, correct, points, answer: userAnswer })
    }

    // Save submission
    const submissions = db.collection('exam_submissions')
    const submission = {
      id: newId(),
      exam_id: examId,
      user_id: gate.user.id,
      answers,
      score: totalScore,
      max_score: maxScore,
      auto_submitted: body.auto_submitted || false,
      id_photo: body.idPhoto || null,
      face_photo: body.facePhoto || null,
      details,
      created_at: nowIso(),
    }
    await submissions.insertOne(submission)

    return NextResponse.json({
      score: totalScore,
      total: maxScore,
      details,
      submission_id: submission.id,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Submit failed'
    console.error('[CodeSpectra] exam-submit:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
