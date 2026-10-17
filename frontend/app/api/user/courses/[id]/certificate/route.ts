/**
 * /api/user/courses/[id]/certificate
 *   GET  -> the caller's certificate for this course, if already issued
 *   POST -> issue (or return the existing) course completion certificate
 *
 * Certificates are written to the shared `certification_attempts` collection
 * so they verify through the same public route as every other certificate
 * (`/cert/verify/[token]` + `/api/certifications/verify/[token]`).
 * One certificate per user per course (`certification_id: course-<id>`).
 *
 * Completion rule: every lesson in the course is in `lesson_completions`, and
 * every module that has a quiz is in `course_progress.completedModules`.
 */
import { NextRequest, NextResponse } from 'next/server'
import type { Document, Filter } from 'mongodb'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import {
  certificationAttempts,
  newAttemptId,
  newAttemptToken,
  nowIsoString,
} from '@/lib/db/certifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const certId = (courseId: string) => `course-${courseId}`

function shape(a: { verify_token: string; submitted_at?: string | null; cert_snapshot: { title: string } }) {
  return {
    title: a.cert_snapshot.title,
    verifyToken: a.verify_token,
    verifyUrl: `/cert/verify/${a.verify_token}`,
    issuedAt: a.submitted_at || null,
  }
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: courseId } = await params
  try {
    const existing = await (await certificationAttempts()).findOne(
      { user_id: user.id, certification_id: certId(courseId), passed: true },
      { projection: { _id: 0 } },
    )
    return NextResponse.json({ certificate: existing ? shape(existing) : null })
  } catch (e) {
    console.error('[course certificate] GET error:', e)
    return NextResponse.json({ error: 'Could not load the certificate' }, { status: 500 })
  }
}

export async function POST(_request: NextRequest, { params }: Ctx) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await rateLimitRedis(`course-cert:${user.id}`, 10, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Try again in a minute.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const { id: courseId } = await params

  try {
    const attempts = await certificationAttempts()
    const existing = await attempts.findOne(
      { user_id: user.id, certification_id: certId(courseId), passed: true },
      { projection: { _id: 0 } },
    )
    if (existing) return NextResponse.json({ success: true, certificate: shape(existing) })

    const db = await getMongoDb()
    const course = await db.collection('courses').findOne({ id: courseId })
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

    const progress = await db.collection('course_progress').findOne({ courseId, userId: user.id })
    if (!progress) return NextResponse.json({ error: 'Enroll in this course first' }, { status: 400 })

    type Section = { lessons?: Array<{ id?: string }>; quiz?: unknown[] }
    const sections: Section[] = Array.isArray(course.sections) ? course.sections : []
    const lessonIds = sections.flatMap((s) => (s.lessons || []).map((l) => l.id).filter((x): x is string => !!x))
    if (lessonIds.length === 0) {
      return NextResponse.json({ error: 'This course has no lessons to complete yet' }, { status: 400 })
    }

    const done = new Set(
      (await db.collection('lesson_completions')
        .find({ courseId, userId: user.id }, { projection: { lessonId: 1 } })
        .toArray()).map((c) => String(c.lessonId)),
    )
    const lessonsLeft = lessonIds.filter((l) => !done.has(l)).length

    const completedModules: number[] = Array.isArray(progress.completedModules) ? progress.completedModules : []
    const quizzesLeft = sections.reduce(
      (n, s, i) => n + (Array.isArray(s.quiz) && s.quiz.length > 0 && !completedModules.includes(i) ? 1 : 0),
      0,
    )

    if (lessonsLeft > 0 || quizzesLeft > 0) {
      const parts = [
        lessonsLeft > 0 ? `${lessonsLeft} lesson${lessonsLeft === 1 ? '' : 's'}` : null,
        quizzesLeft > 0 ? `${quizzesLeft} module quiz${quizzesLeft === 1 ? '' : 'zes'}` : null,
      ].filter(Boolean)
      return NextResponse.json({ error: `Finish ${parts.join(' and ')} to get your certificate` }, { status: 400 })
    }

    const finalExamScore = progress.finalExamScore
    if (typeof finalExamScore === 'number' && finalExamScore < 80) {
      return NextResponse.json({ error: `Final exam score ${finalExamScore}%: 80% is needed for the certificate` }, { status: 400 })
    }

    const quizScores = Object.values(progress.quizScores || {}).filter((v): v is number => typeof v === 'number')
    const avgQuiz = quizScores.length > 0 ? Math.round(quizScores.reduce((a, b) => a + b, 0) / quizScores.length) : null

    const userDoc = await db.collection('user').findOne(
      { $or: [{ id: user.id }, { _id: user.id }] } as Filter<Document>,
      { projection: { name: 1, fullName: 1 } },
    )
    const name = String(userDoc?.fullName || userDoc?.name || user.name || 'CodeSpectra learner')

    const now = nowIsoString()
    const doc = {
      id: newAttemptId(),
      user_id: user.id,
      certification_id: certId(courseId),
      verify_token: newAttemptToken(),
      started_at: String(progress.enrolledAt || now),
      submitted_at: now,
      score: avgQuiz ?? 100,
      passed: true,
      score_label: avgQuiz != null ? `Average quiz score ${avgQuiz}%` : 'Course completed',
      snapshot: { name },
      cert_snapshot: {
        title: String(course.title || 'Course'),
        level: String(course.level || 'Course'),
        source: 'CodeSpectra course',
      },
    }

    // Idempotent under concurrent clicks: insert only if no certificate exists yet.
    const res = await attempts.updateOne(
      { user_id: user.id, certification_id: doc.certification_id, passed: true },
      { $setOnInsert: doc },
      { upsert: true },
    )
    const saved = res.upsertedCount > 0
      ? doc
      : await attempts.findOne({ user_id: user.id, certification_id: doc.certification_id, passed: true })
    if (!saved) return NextResponse.json({ error: 'Could not issue the certificate' }, { status: 500 })

    await db.collection('course_progress').updateOne(
      { courseId, userId: user.id },
      { $set: { certificateUrl: `/cert/verify/${saved.verify_token}`, completedAt: progress.completedAt || now } },
    )

    return NextResponse.json({ success: true, certificate: shape(saved) })
  } catch (e) {
    console.error('[course certificate] POST error:', e)
    return NextResponse.json({ error: 'Could not issue the certificate' }, { status: 500 })
  }
}
