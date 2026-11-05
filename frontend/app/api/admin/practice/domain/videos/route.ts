/**
 * POST /api/admin/practice/domain/videos — generate, upload and attach walkthrough
 * videos for the practice problems of an industry / tech-stack / level coordinate.
 *
 * Superadmin (2FA), unlimited on AI credits: nothing is charged. Each published
 * problem becomes a lesson on the coordinate's catalog course, and a scoped video
 * job is queued so the course worker renders + uploads the MP4s and attaches them.
 * Idempotent: re-attaching the same problems never duplicates lessons or jobs.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, gateErrorBody } from '@/lib/route-auth'
import { readS3Config } from '@/lib/s3-storage'
import { INDUSTRIES, COURSE_LEVELS, type IndustryId } from '@/lib/practice-content/domain-practice'
import { attachPracticeVideos } from '@/lib/courses/problem-video'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json(gateErrorBody(gate), { status: gate.status })

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

  // R2/S3 preflight: MP4s over ~15MB can't live in Mongo; fail fast with a
  // readable message instead of letting the worker burn LLM+TTS minutes then
  // fail at upload (same gate as /api/admin/courses/jobs).
  if (!(await readS3Config())) {
    return NextResponse.json(
      { error: 'Object storage (Admin → Settings → Cloudflare) is required to generate problem videos.', code: 'video_storage_required' },
      { status: 400 },
    )
  }

  const out = await attachPracticeVideos({ techStack, level, problemIds, requestedBy: gate.user.id })

  if (!out.ok) {
    const body_: { error: string; code: string } =
      out.reason === 'no-problems'
        ? { error: 'No published problems found for those ids.', code: 'video_no_problems' }
        : { error: 'Could not queue the video job. Try again.', code: 'video_job_failed' }
    return NextResponse.json(body_, { status: out.reason === 'no-problems' ? 404 : 502 })
  }

  return NextResponse.json({
    ...out,
    message: out.jobId
      ? `Queued ${out.attached.length} problem video(s) for "${out.courseTitle}". The course worker will render, upload and attach them.`
      : `An in-flight job already covers this course — ${out.attached.length} new lesson(s) attached without a new job.`,
  })
}
