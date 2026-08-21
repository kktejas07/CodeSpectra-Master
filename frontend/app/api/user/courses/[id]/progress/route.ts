import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PATCH_FIELDS = [
  'completedModules',
  'quizScores',
  'currentModule',
  'currentLesson',
  'skippedToFinal',
  'finalExamScore',
  'certificateUrl',
  'completedAt',
  'currentLessonId',
] as const

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: courseId } = await params

  try {
    const db = await getMongoDb()
    const progress = await db.collection('course_progress').findOne({
      courseId,
      userId: user.id,
    })

    if (!progress) {
      return NextResponse.json({
        courseId,
        userId: user.id,
        enrolledAt: new Date().toISOString(),
        completedModules: [],
        quizScores: {},
        currentModule: 0,
        currentLesson: 0,
        currentLessonId: null,
        lessonPositions: {},
        skippedToFinal: false,
        lastAccessedAt: new Date().toISOString(),
      })
    }

    return NextResponse.json({
      ...progress,
      lessonPositions: progress.lessonPositions && typeof progress.lessonPositions === 'object'
        ? progress.lessonPositions
        : {},
    })
  } catch (e) {
    console.error('[progress] GET error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: courseId } = await params

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const db = await getMongoDb()

    const $set: Record<string, unknown> = {
      courseId,
      userId: user.id,
      lastAccessedAt: new Date().toISOString(),
    }

    for (const k of PATCH_FIELDS) {
      if (k in body) $set[k] = body[k]
    }

    const lessonId = typeof body.lessonId === 'string' ? body.lessonId.trim() : ''
    const position = Number(body.position)
    if (lessonId && Number.isFinite(position) && position >= 0) {
      $set[`lessonPositions.${lessonId}`] = Math.floor(position)
      $set.currentLessonId = lessonId
    }

    await db.collection('course_progress').updateOne(
      { courseId, userId: user.id },
      {
        $set,
        $setOnInsert: { enrolledAt: new Date().toISOString() },
      },
      { upsert: true },
    )

    const course = await db.collection('courses').findOne({ id: courseId })
    if (course) {
      const totalModules = course.sections?.length || 0
      const completedModules = Array.isArray(body.completedModules) ? body.completedModules : []
      if (totalModules > 0 && completedModules.length === totalModules && !body.completedAt) {
        await db.collection('course_progress').updateOne(
          { courseId, userId: user.id },
          { $set: { completedAt: new Date().toISOString() } },
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[progress] POST error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
