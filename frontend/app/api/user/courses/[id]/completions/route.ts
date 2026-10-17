/**
 * /api/user/courses/[id]/completions
 *   GET  -> lesson ids the server has recorded as completed (with evidence).
 *   POST -> { lessonId, mode: 'watched' | 'read', position? }
 *           Records a completion only when the server's own activity record
 *           (heartbeats from POST /progress) shows the lesson was actually
 *           watched to the end or read for long enough. Idempotent.
 *
 * ponytail: this can't prove a human watched — a scripted client can still
 * send heartbeats in real time — but it can no longer be skipped by a
 * single "complete" request, and it costs the real lesson time.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'
import {
  SAFE_KEY_RE,
  allLessonIds,
  ensureCourseIndexes,
  findLesson,
  lessonDurationSec,
  lessonHasText,
  lessonHasVideo,
  minReadSeconds,
  minWatchSeconds,
} from '../../_lib/course-rules'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Ctx) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: courseId } = await params

  try {
    const db = await getMongoDb()
    // Legacy rows without `evidence` were written on the browser's word and don't count.
    const completions = await db.collection('lesson_completions')
      .find({ courseId, userId: user.id, evidence: { $exists: true } }, { projection: { lessonId: 1 } })
      .toArray()

    return NextResponse.json({ completedLessons: completions.map((c) => c.lessonId) })
  } catch (e) {
    console.error('[completions] GET error:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = rateLimitSlidingWindow(`course-complete:${user.id}`, 30, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { id: courseId } = await params

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const lessonId = typeof body.lessonId === 'string' ? body.lessonId.trim() : ''
    const mode = body.mode === 'read' ? 'read' : body.mode === 'watched' ? 'watched' : null
    if (!lessonId || !SAFE_KEY_RE.test(lessonId) || !mode) {
      return NextResponse.json({ error: 'lessonId and mode are required' }, { status: 400 })
    }

    const db = await getMongoDb()
    const course = await db.collection('courses').findOne({ id: courseId })
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    const found = findLesson(course, lessonId)
    if (!found) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    const { lesson } = found

    const existing = await db.collection('lesson_completions').findOne(
      { courseId, userId: user.id, lessonId, evidence: { $exists: true } },
      { projection: { _id: 1 } },
    )
    if (existing) return NextResponse.json({ success: true, completed: true })

    const progress = await db.collection('course_progress').findOne(
      { courseId, userId: user.id },
      { projection: { lessonActiveSec: 1, lessonMaxPosition: 1 } },
    )
    const activeSec = Number(progress?.lessonActiveSec?.[lessonId]) || 0
    const duration = lessonDurationSec(lesson)
    // The final stretch of a video may not have reached a heartbeat yet.
    const reported = Number(body.position)
    const maxPos = Math.max(
      Number(progress?.lessonMaxPosition?.[lessonId]) || 0,
      Number.isFinite(reported) && reported >= 0 ? Math.min(reported, duration || reported) : 0,
    )

    let ok = false
    let needed = 0
    if (mode === 'watched') {
      if (!lessonHasVideo(lesson)) {
        return NextResponse.json({ error: 'This lesson has no video' }, { status: 400 })
      }
      needed = minWatchSeconds(lesson)
      const reachedEnd = duration > 0 ? maxPos >= duration * 0.9 : true
      ok = reachedEnd && activeSec >= needed
    } else {
      if (!lessonHasText(lesson)) {
        return NextResponse.json({ error: 'This lesson has no reading' }, { status: 400 })
      }
      needed = minReadSeconds(lesson)
      ok = activeSec >= needed
    }

    if (!ok) {
      return NextResponse.json(
        {
          completed: false,
          error: mode === 'watched' ? 'Watch the video to the end to complete this lesson' : 'Keep reading to complete this lesson',
          activeSeconds: Math.floor(activeSec),
          neededSeconds: needed,
        },
        { status: 409 },
      )
    }

    await ensureCourseIndexes(db)
    const now = new Date().toISOString()
    try {
      await db.collection('lesson_completions').updateOne(
        { courseId, userId: user.id, lessonId },
        {
          $set: {
            completedAt: now,
            evidence: { mode, activeSeconds: Math.floor(activeSec), maxPosition: Math.floor(maxPos), duration },
          },
          $setOnInsert: { courseId, userId: user.id, lessonId },
        },
        { upsert: true },
      )
    } catch (e) {
      if ((e as { code?: number })?.code !== 11000) throw e
    }

    // Mark the course finished once every lesson has evidence (quizzes are checked at certificate time).
    const lessonIds = allLessonIds(course)
    const done = await db.collection('lesson_completions').countDocuments({
      courseId, userId: user.id, lessonId: { $in: lessonIds }, evidence: { $exists: true },
    })
    if (lessonIds.length > 0 && done >= lessonIds.length) {
      await db.collection('course_progress').updateOne(
        { courseId, userId: user.id, completedAt: null },
        { $set: { completedAt: now } },
      ).catch(() => {})
    }

    return NextResponse.json({ success: true, completed: true })
  } catch (e) {
    console.error('[completions] POST error:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
