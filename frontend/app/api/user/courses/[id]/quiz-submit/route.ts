import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST - Submit quiz answers and grade them
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: courseId } = await params

  try {
    const { sectionIndex, answers } = await request.json()
    // answers: { questionIndex: selectedOptionIndex }

    if (sectionIndex == null || !answers) {
      return NextResponse.json({ error: 'sectionIndex and answers required' }, { status: 400 })
    }

    const db = await getMongoDb()
    const course = await db.collection('courses').findOne({ id: courseId })
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

    const sections = course.sections || []
    const section = sections[sectionIndex]
    if (!section) return NextResponse.json({ error: 'Section not found' }, { status: 404 })

    const quiz = section.quiz || []
    if (quiz.length === 0) {
      return NextResponse.json({ error: 'No quiz questions for this module' }, { status: 400 })
    }

    // Grade the answers
    let correct = 0
    const results = quiz.map((q: any, i: number) => {
      const userAnswer = answers[i]
      const isCorrect = userAnswer === q.correct
      if (isCorrect) correct++
      return {
        questionIndex: i,
        question: q.question,
        userAnswer,
        correctAnswer: q.correct,
        isCorrect,
        explanation: q.explanation,
      }
    })

    const score = Math.round((correct / quiz.length) * 100)
    const passed = score >= 80

    // Save quiz result
    await db.collection('quiz_results').insertOne({
      courseId,
      userId: user.id,
      sectionIndex,
      score,
      correct,
      total: quiz.length,
      passed,
      answers,
      results,
      submittedAt: new Date().toISOString(),
    })

    // Update progress if passed
    if (passed) {
      const progress = await db.collection('course_progress').findOne({
        courseId,
        userId: user.id,
      })

      const completedModules = progress?.completedModules || []
      if (!completedModules.includes(sectionIndex)) {
        completedModules.push(sectionIndex)
      }

      await db.collection('course_progress').updateOne(
        { courseId, userId: user.id },
        {
          $set: {
            [`quizScores.${sectionIndex}`]: score,
            completedModules,
            currentModule: Math.max(progress?.currentModule || 0, sectionIndex + 1),
            lastAccessedAt: new Date().toISOString(),
          },
        },
        { upsert: true }
      )
    }

    return NextResponse.json({
      success: true,
      score,
      correct,
      total: quiz.length,
      passed,
      results,
      message: passed
        ? `Congratulations! You passed with ${score}%`
        : `You scored ${score}% — 80% required to pass. Review the material and try again.`,
    })
  } catch (e) {
    console.error('[quiz-submit] error:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
