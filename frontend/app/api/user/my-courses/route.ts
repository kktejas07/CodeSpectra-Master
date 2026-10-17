import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { courseCompletionStatus } from '@/app/api/user/courses/_lib/course-rules'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET — courses the user is enrolled in, with progress.
 *
 * Progress comes from the same server-verified records the course page and the
 * certificate route use (`courseCompletionStatus`: evidence-backed
 * lesson_completions + graded quiz_results). Legacy browser-written fields
 * such as course_progress.completed_lessons / progress are ignored.
 */
export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const db = await getMongoDb()
    const enrollments = await db
      .collection('course_enrollments')
      .find({ userId: user.id })
      .sort({ enrolledAt: -1 })
      .toArray()
    const ids = [...new Set(enrollments.map((e) => String(e.courseId ?? '')).filter(Boolean))]
    if (!ids.length) return NextResponse.json({ courses: [] })

    const courses = await db
      .collection('courses')
      .find({ id: { $in: ids } })
      .project({ id: 1, title: 1, description: 1, category: 1, level: 1, thumbnail: 1, image: 1, sections: 1 })
      .toArray()
    const byId = new Map(courses.map((c) => [String(c.id), c]))

    const ordered = await Promise.all(
      ids.map(async (id) => {
        const c = byId.get(id)
        if (!c) return null
        const en = enrollments.find((e) => String(e.courseId) === id)
        const status = await courseCompletionStatus(db, c, user.id)
        const progressPercent = status.totalLessons > 0
          ? Math.round((status.lessonsDone / status.totalLessons) * 100)
          : 0
        return {
          id: String(c.id),
          title: c.title || id,
          description: c.description || '',
          category: c.category || '',
          level: c.level || '',
          thumbnail: c.thumbnail || c.image || null,
          enrolledAt: en?.enrolledAt || null,
          progressPercent,
          lessonsDone: status.lessonsDone,
          totalLessons: status.totalLessons,
          quizzesPassed: status.quizzesPassed,
          quizzesTotal: status.quizzesTotal,
          completed: status.totalLessons > 0 && status.lessonsLeft === 0 && status.quizzesLeft === 0,
        }
      }),
    )

    return NextResponse.json({ courses: ordered.filter(Boolean) })
  } catch (e) {
    console.error('[user/my-courses]', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
