/**
 * POST /api/user/courses/[id]/quiz-submit
 *   { sectionIndex, answers: { [questionIndex]: optionIndex } }
 *
 * Grades a module quiz on the server from the stored answer key (the key is
 * never sent to learners — see publicCourse). Every attempt is kept in
 * `quiz_results`; certificates and module unlocks read passes from there.
 * The response reveals the correct options for this attempt only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'
import { QUIZ_PASS_PERCENT, ensureCourseIndexes, sectionQuizKey } from '../../_lib/course-rules'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = rateLimitSlidingWindow(`course-quiz:${user.id}`, 20, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in a minute.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const { id: courseId } = await params

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const sectionIndex = Number(body.sectionIndex)
    const rawAnswers = body.answers && typeof body.answers === 'object' ? (body.answers as Record<string, unknown>) : null
    if (!Number.isInteger(sectionIndex) || sectionIndex < 0 || !rawAnswers) {
      return NextResponse.json({ error: 'sectionIndex and answers required' }, { status: 400 })
    }

    const db = await getMongoDb()
    const course = await db.collection('courses').findOne({ id: courseId })
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

    const quiz = sectionQuizKey(course, sectionIndex)
    if (quiz.length === 0) {
      return NextResponse.json({ error: 'No quiz questions for this module' }, { status: 400 })
    }

    const answers: Record<number, number> = {}
    for (let i = 0; i < quiz.length; i++) {
      const v = Number(rawAnswers[String(i)])
      if (Number.isInteger(v) && v >= 0 && v < quiz[i].options.length) answers[i] = v
    }

    let correct = 0
    const results = quiz.map((q, i) => {
      const userAnswer = answers[i] ?? null
      const isCorrect = userAnswer === q.correct
      if (isCorrect) correct++
      return { questionIndex: i, userAnswer, correctAnswer: q.correct, isCorrect, explanation: q.explanation }
    })

    const score = Math.round((correct / quiz.length) * 100)
    const passed = score >= QUIZ_PASS_PERCENT
    const now = new Date().toISOString()

    await ensureCourseIndexes(db)
    await db.collection('quiz_results').insertOne({
      courseId,
      userId: user.id,
      sectionIndex,
      score,
      correct,
      total: quiz.length,
      passed,
      answers,
      submittedAt: now,
    })
    await db.collection('course_progress').updateOne(
      { courseId, userId: user.id },
      { $set: { lastAccessedAt: now }, $setOnInsert: { courseId, userId: user.id, enrolledAt: now } },
      { upsert: true },
    )

    return NextResponse.json({
      success: true,
      score,
      correct,
      total: quiz.length,
      passed,
      passPercent: QUIZ_PASS_PERCENT,
      results,
    })
  } catch (e) {
    console.error('[quiz-submit] error:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
