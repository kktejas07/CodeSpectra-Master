/**
 * /api/user/courses/[id]/progress
 *   GET  -> the learner's progress. `completedModules` and `quizScores` are
 *           derived from server-graded quiz_results (plus grandfathered legacy
 *           passes recorded before verification), never from this request.
 *   POST -> activity heartbeat for one lesson: { lessonId, position? }.
 *           Records resume position and accumulates active seconds that
 *           POST /completions uses as evidence. Any client-sent progress
 *           numbers (completedModules, quizScores, finalExamScore, completedAt…)
 *           are ignored and never written, so no new "legacy-looking" passes
 *           can be created (see course-rules deriveCompletionStatus).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'
import {
  MAX_BEAT_GAP_SEC,
  SAFE_KEY_RE,
  courseCompletionStatus,
  findLesson,
  lessonDurationSec,
} from '../../_lib/course-rules'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Ctx) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const { id: courseId } = await params

  try {
    const db = await getMongoDb()
    const [progress, course] = await Promise.all([
      db.collection('course_progress').findOne({ courseId, userId: user.id }),
      db.collection('courses').findOne({ id: courseId }),
    ])
    const status = course ? await courseCompletionStatus(db, course, user.id) : null

    return NextResponse.json({
      courseId,
      enrolledAt: progress?.enrolledAt || null,
      lastAccessedAt: progress?.lastAccessedAt || null,
      currentLessonId: typeof progress?.currentLessonId === 'string' ? progress.currentLessonId : null,
      lessonPositions: progress?.lessonPositions && typeof progress.lessonPositions === 'object' ? progress.lessonPositions : {},
      completedModules: status?.passedSections ?? [],
      quizScores: status?.bestScores ?? {},
      lessonsDone: status?.lessonsDone ?? 0,
      totalLessons: status?.totalLessons ?? 0,
      quizzesLeft: status?.quizzesLeft ?? 0,
      // Some progress was carried over from before server verification (still counts).
      legacy: status?.legacy ?? false,
      completedAt: progress?.completedAt || null,
      certificateUrl: typeof progress?.certificateUrl === 'string' ? progress.certificateUrl : null,
    })
  } catch (e) {
    console.error('[progress] GET error:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  // Heartbeats arrive every 5–10 s per open lesson; this only stops floods.
  const rl = rateLimitSlidingWindow(`course-beat:${user.id}`, 60, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests', code: 'too_many_requests' }, { status: 429 })

  const { id: courseId } = await params

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const lessonId = typeof body.lessonId === 'string' ? body.lessonId.trim() : ''
    if (!lessonId || !SAFE_KEY_RE.test(lessonId)) {
      return NextResponse.json({ error: 'lessonId required' }, { status: 400 })
    }

    const db = await getMongoDb()
    const course = await db.collection('courses').findOne({ id: courseId })
    if (!course) return NextResponse.json({ error: 'Course not found', code: 'course_not_found' }, { status: 404 })
    const found = findLesson(course, lessonId)
    if (!found) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })

    const progress = await db.collection('course_progress').findOne(
      { courseId, userId: user.id },
      { projection: { lessonLastBeatAt: 1 } },
    )
    const now = Date.now()
    const nowIso = new Date(now).toISOString()
    const lastBeat = Number(progress?.lessonLastBeatAt?.[lessonId])
    const gapSec = Number.isFinite(lastBeat) ? (now - lastBeat) / 1000 : Infinity

    const $set: Record<string, unknown> = {
      lastAccessedAt: nowIso,
      currentLessonId: lessonId,
      [`lessonLastBeatAt.${lessonId}`]: now,
    }
    const $inc: Record<string, number> = {}
    const $max: Record<string, number> = {}

    if (gapSec > 0 && gapSec <= MAX_BEAT_GAP_SEC) {
      $inc[`lessonActiveSec.${lessonId}`] = Math.round(gapSec * 10) / 10
    }

    const position = Number(body.position)
    if (Number.isFinite(position) && position >= 0) {
      const duration = lessonDurationSec(found.lesson)
      const pos = Math.floor(Math.min(position, duration > 0 ? duration : 86_400))
      $set[`lessonPositions.${lessonId}`] = pos
      $max[`lessonMaxPosition.${lessonId}`] = pos
    }

    const update: Record<string, unknown> = {
      $set,
      $setOnInsert: { courseId, userId: user.id, enrolledAt: nowIso },
    }
    if (Object.keys($inc).length) update.$inc = $inc
    if (Object.keys($max).length) update.$max = $max

    await db.collection('course_progress').updateOne({ courseId, userId: user.id }, update, { upsert: true })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[progress] POST error:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}
