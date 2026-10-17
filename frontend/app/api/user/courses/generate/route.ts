import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { buildCatalogCourse } from '@/lib/courses/build-course'
import { courseIdFor, estimateCourse } from '@/lib/courses/syllabus'
import { findBusyJob } from '@/lib/courses/process-job'
import { spendAiCredits, getUserAiCredits } from '@/lib/user-credits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CREDIT_COST = 10

async function ensureEnrolled(userId: string, courseId: string) {
  const db = await getMongoDb()
  const existing = await db.collection('course_enrollments').findOne({ userId, courseId })
  if (existing) return
  await db.collection('course_enrollments').insertOne({
    userId,
    courseId,
    enrolledAt: new Date().toISOString(),
  })
  await db.collection('courses').updateOne({ id: courseId }, { $inc: { enrolled: 1 } })
}

/** User path: reuse catalog course if present; otherwise create from syllabus and queue videos. */
export async function POST(request: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const techStack = String(body.technology || body.techStack || '').trim()
    const level = String(body.level || 'beginner').trim()
    if (!techStack || !level) {
      return NextResponse.json({ error: 'technology and level are required' }, { status: 400 })
    }

    const db = await getMongoDb()
    const courseId = courseIdFor(techStack, level)
    const existing = await db.collection('courses').findOne({ id: courseId })

    if (existing) {
      await ensureEnrolled(user.id, courseId)
      const totalLessons = (existing.sections || []).reduce(
        (n: number, s: any) => n + (s.lessons?.length || 0),
        0,
      )
      const videos = (existing.sections || []).reduce(
        (n: number, s: any) => n + (s.lessons || []).filter((l: any) => l.videoUrl).length,
        0,
      )
      // Queue remaining videos if the outline exists but media is incomplete. The worker
      // takes pending jobs oldest-first (claimNextPendingJob), so a busy worker just means a wait.
      if (videos < totalLessons) {
        {
          const pending = await db.collection('generation_jobs').findOne({
            courseId,
            status: { $in: ['pending', 'running'] },
          })
          if (!pending) {
            await db.collection('generation_jobs').insertOne({
              id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              courseId,
              courseTitle: existing.title,
              type: 'video',
              status: 'pending',
              progress: 0,
              totalItems: totalLessons,
              completedItems: videos,
              failedItems: 0,
              logs: [{
                timestamp: new Date().toISOString(),
                message: `User "${user.email || user.id}" requested remaining videos`,
                type: 'info',
              }],
              startedAt: new Date().toISOString(),
              requestedBy: user.id,
            })
          }
        }
      }
      return NextResponse.json({
        success: true,
        course_id: courseId,
        course: { id: courseId, title: existing.title },
        existing: true,
        creditsCharged: 0,
        message: videos < totalLessons
          ? 'Course outline ready — videos are generating. You are enrolled.'
          : 'Course ready. You are enrolled.',
      })
    }

    const credits = await getUserAiCredits(user.id)
    if (credits.balance < CREDIT_COST) {
      return NextResponse.json(
        { error: 'Insufficient credits', balance: credits.balance, required: CREDIT_COST },
        { status: 403 },
      )
    }

    const busy = await findBusyJob()
    const { course, totalLessons, plan } = buildCatalogCourse(techStack, level)
    // Atomic spend before creating anything (fails if the balance ran out meanwhile).
    const spent = await spendAiCredits(user.id, CREDIT_COST)
    if (!spent.ok) {
      return NextResponse.json({ error: 'Insufficient credits', balance: spent.balance, required: CREDIT_COST }, { status: 403 })
    }
    await db.collection('courses').insertOne(course)
    await ensureEnrolled(user.id, courseId)

    // Always queue: the worker processes pending jobs oldest-first, so the credits
    // paid here always correspond to a queued video job.
    let job = null
    {
      job = {
        id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        courseId,
        courseTitle: course.title,
        type: 'video',
        status: 'pending',
        progress: 0,
        totalItems: totalLessons,
        completedItems: 0,
        failedItems: 0,
        logs: [{
          timestamp: new Date().toISOString(),
          message: `Created from catalog for user "${user.email || user.id}" (~${plan.estimatedHours}h, ${totalLessons} lessons)`,
          type: 'info',
        }],
        startedAt: new Date().toISOString(),
        requestedBy: user.id,
      }
      await db.collection('generation_jobs').insertOne(job)
    }

    return NextResponse.json({
      success: true,
      course_id: courseId,
      course: { id: courseId, title: course.title, sections: course.sections.length, totalLessons },
      existing: false,
      creditsCharged: CREDIT_COST,
      jobQueued: Boolean(job),
      message: busy
        ? `Created "${course.title}". Videos are queued and will start after the jobs ahead of it.`
        : `Created "${course.title}" and queued video generation.`,
    })
  } catch (e) {
    console.error('[user/courses/generate]', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
