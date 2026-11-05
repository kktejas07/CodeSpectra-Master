/**
 * POST /api/practice/domain/videos — learner-facing: generate, upload and attach
 * walkthrough videos for a set of published practice problems, on the
 * coordinate's catalog course.
 *
 * Charges 1 AI credit per NEWLY attached problem (duplicates are free), so a
 * learner only pays for video work that doesn't exist yet. Enrolls the learner
 * in the course so the attached videos are visible.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { readS3Config } from '@/lib/s3-storage'
import { getUserAiCredits, spendAiCredits, outOfCredits } from '@/lib/user-credits'
import { INDUSTRIES, COURSE_LEVELS, type IndustryId } from '@/lib/practice-content/domain-practice'
import { attachPracticeVideos } from '@/lib/courses/problem-video'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CREDIT_PER_VIDEO = 1

async function ensureEnrolled(userId: string, courseId: string): Promise<void> {
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

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const industry = String(body.industry || '').trim().toLowerCase() as IndustryId
  const techStack = String(body.techStack || body.tech_stack || '').trim()
  const level = String(body.level || '').trim()
  const problemIds = Array.isArray(body.problemIds) ? (body.problemIds as unknown[]).map(String).filter(Boolean) : []

  if (!INDUSTRIES.some(i => i.id === industry)) {
    return NextResponse.json({ error: 'Unknown industry', code: 'bad_industry' }, { status: 400 })
  }
  if (!techStack) {
    return NextResponse.json({ error: 'techStack is required', code: 'techstack_is_required' }, { status: 400 })
  }
  if (!COURSE_LEVELS.includes(level as (typeof COURSE_LEVELS)[number])) {
    return NextResponse.json({ error: 'Unknown level', code: 'bad_level' }, { status: 400 })
  }
  if (problemIds.length === 0) {
    return NextResponse.json({ error: 'problemIds is required', code: 'problem_ids_required' }, { status: 400 })
  }

  // Same R2/S3 preflight as the admin route — a learner should never be charged
  // for videos that the worker can't upload.
  if (!(await readS3Config())) {
    return NextResponse.json(
      { error: 'Object storage (Admin → Settings → Cloudflare) is required to generate problem videos.', code: 'video_storage_required' },
      { status: 400 },
    )
  }

  const out = await attachPracticeVideos({ techStack, level, problemIds, requestedBy: user.id })

  if (!out.ok) {
    const res =
      out.reason === 'no-problems'
        ? NextResponse.json({ error: 'No published problems found for those ids.', code: 'video_no_problems' }, { status: 404 })
        : NextResponse.json({ error: 'Could not queue the video job. Try again.', code: 'video_job_failed' }, { status: 502 })
    return res
  }

  // Attachments landed on the shared catalog course — the learner should be able to open it.
  if (out.courseId) {
    try {
      await ensureEnrolled(user.id, out.courseId)
    } catch {
      /* enrollment is best effort; the course page still renders */
    }
  }

  // Charge only for NEW video work: freshly attached lessons. Superadmins are
  // unlimited (spendAiCredits is a no-op), so no refund path is needed.
  const charged = out.attached.length > 0 ? out.attached.length * CREDIT_PER_VIDEO : 0
  let balance: number | null = null
  let unlimited = false
  if (out.attached.length > 0) {
    const pre = await getUserAiCredits(user.id)
    unlimited = pre.unlimited
    if (!pre.unlimited && pre.balance < charged) {
      // Attachments already landed on the course; report them, no charge made.
      return NextResponse.json({
        ...out,
        charged: 0,
        balance: pre.balance,
        unlimited: false,
        message: 'Lessons attached, but not enough AI credits to queue the videos. Top up, then retry — nothing is charged twice.',
      })
    }
    if (!pre.unlimited) {
      const spent = await spendAiCredits(user.id, charged)
      if (spent.ok) balance = spent.balance
      else {
        return NextResponse.json(outOfCredits({ cost: charged, balance: spent.balance }), { status: 402 })
      }
    }
  }

  return NextResponse.json({
    ...out,
    charged,
    balance,
    unlimited,
    message: out.jobId
      ? `Queued ${out.attached.length} problem video(s) for "${out.courseTitle}". The course worker will render, upload and attach them.`
      : `An in-flight job already covers this course — ${out.attached.length} new lesson(s) attached without a new job.`,
  })
}
