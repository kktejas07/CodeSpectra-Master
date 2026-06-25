import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { exams, examSubmissions, newId, nowIso } from '@/lib/db/content'
import type { IdRouteContext } from '@/lib/app-route-context'

export async function POST(request: Request, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { id } = await params
  try {
    const body = (await request.json().catch(() => ({}))) as {
      answers?: Record<string, number>
    }

    const examCol = await exams()
    const exam = await examCol.findOne({ id })

    let score = 0
    let total = 0

    if (exam?.questions?.length && body.answers) {
      total = exam.questions.length
      for (const q of exam.questions) {
        if (
          typeof q.correctAnswer === 'number' &&
          body.answers[q.id] === q.correctAnswer
        ) {
          score += 1
        }
      }
      score = Math.round((score / total) * 100)
    } else {
      // No questions configured — return 0 rather than a random score.
      score = 0
    }

    const passed = exam?.passing_score ? score >= exam.passing_score : score >= 70

    const sub = {
      id: newId(),
      exam_id: id,
      user_id: gate.user.id,
      score,
      passed,
      certificate_url: passed ? `/certificates/${id}` : null,
      submitted_at: nowIso(),
    }
    const subCol = await examSubmissions()
    await subCol.insertOne(sub)

    return NextResponse.json({
      success: true,
      examId: id,
      score,
      passed,
      submittedAt: sub.submitted_at,
      certificateUrl: sub.certificate_url,
    })
  } catch (error) {
    console.error('[CodeSpectra] exam submit:', error)
    return NextResponse.json({ error: 'Failed to submit exam' }, { status: 400 })
  }
}
