import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

/**
 * Aggregate learning progress summary for the signed-in user:
 *   GET /api/learning/progress/summary
 * Returns `{ data: { total_courses, completed_courses, avg_percent, lessons_done } }`
 */
export async function GET(request: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  try {
    const db = await getMongoDb()
    const rows = await db
      .collection('learning_progress')
      .find({ user_id: user.id })
      .toArray()

    const totalCourses = rows.length
    const completedCourses = rows.filter((r) => Number(r.percent) >= 100).length
    const avgPercent = totalCourses
      ? Math.round(rows.reduce((acc, r) => acc + (Number(r.percent) || 0), 0) / totalCourses)
      : 0
    const lessonsDone = rows.reduce((acc, r) => acc + (Array.isArray(r.completed_lessons) ? r.completed_lessons.length : 0), 0)

    return NextResponse.json({
      data: {
        total_courses: totalCourses,
        completed_courses: completedCourses,
        avg_percent: avgPercent,
        lessons_done: lessonsDone,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch progress summary' }, { status: 500 })
  }
}