/**
 * CAD task submission for a real exam.
 *
 * GET  — the candidate's staged (uploaded, not yet submitted) files for this exam.
 * POST — submit the attempt: staged files + design rationale. Same entry
 *        checks and attempt limit as POST /api/exams/[id]/submit
 *        (lib/exam-access.ts), stored atomically via recordExamAttempt. The
 *        attempt lands as "pending review" with one manually graded item
 *        (CAD_TASK_QID) that the existing grading route scores.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ids'
import { parseUserAgent } from '@/lib/db/sessions'
import { isIpInCidr } from '@/lib/db/security'
import { checkExamEntry, recordExamAttempt } from '@/lib/exam-access'
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'
import {
  CAD_DEFAULT_POINTS,
  CAD_RATIONALE_MAX_CHARS,
  CAD_RATIONALE_MIN_CHARS,
  CAD_TASK_QID,
  type CadFileMeta,
  type CadSubmissionInfo,
} from '@/lib/cad-submission'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const META_PROJECTION = { _id: 0, id: 1, kind: 1, name: 1, size: 1, scan_status: 1, uploaded_at: 1 } as const

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id: examId } = await ctx.params
  try {
    const db = await getMongoDb()
    const staged = await db.collection('exam_submission_files')
      .find({ exam_id: examId, user_id: gate.user.id, status: 'staged' }, { projection: META_PROJECTION })
      .sort({ uploaded_at: -1 })
      .toArray()
    return NextResponse.json({ staged })
  } catch (e) {
    console.error('[cad-submission] GET:', e)
    return NextResponse.json({ error: 'Failed to load your files' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth().catch(() => null)
  if (!gate || 'error' in gate) {
    return NextResponse.json({ error: 'You must be signed in to take this assessment.' }, { status: 401 })
  }
  const { id: userId, email } = gate.user
  const { id: examId } = await ctx.params

  const rl = rateLimitSlidingWindow(`cad-submit:${userId}:${examId}`, 5, 60 * 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many submission attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const rationale = typeof body.rationale === 'string' ? body.rationale.trim() : ''
  const taskCode = typeof body.task_code === 'string' ? body.task_code.slice(0, 64) : null
  const autoSubmitted = body.auto_submitted === true
  const inviteToken = typeof body.inviteToken === 'string' ? body.inviteToken : null
  const linkToken = typeof body.linkToken === 'string' ? body.linkToken : null
  const startedAt = typeof body.started_at === 'string' && !Number.isNaN(Date.parse(body.started_at)) ? body.started_at : null
  const totalTimeMs = Math.max(0, Math.min(Number(body.total_time_ms) || 0, 7 * 24 * 3600 * 1000))

  if (rationale.length > CAD_RATIONALE_MAX_CHARS) {
    return NextResponse.json({ error: `Design rationale is too long (max ${CAD_RATIONALE_MAX_CHARS} characters).` }, { status: 400 })
  }
  if (!autoSubmitted && rationale.length < CAD_RATIONALE_MIN_CHARS) {
    return NextResponse.json({ error: `Write at least ${CAD_RATIONALE_MIN_CHARS} characters of design rationale.` }, { status: 400 })
  }

  try {
    const db = await getMongoDb()

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || ''
    if (clientIp) {
      const blocked = await db.collection('ip_blocklist').find({ active: { $ne: false } }).toArray()
      if (blocked.some((entry) => isIpInCidr(clientIp, String(entry.ip)))) {
        return NextResponse.json({ error: 'This IP address has been blocked.' }, { status: 403 })
      }
    }

    const exam = await db.collection('exams').findOne({ id: examId })
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

    const access = await checkExamEntry(db, exam as Record<string, unknown>, { id: userId, email }, { inviteToken, linkToken })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const files = (await db.collection('exam_submission_files')
      .find({ exam_id: examId, user_id: userId, status: 'staged' }, { projection: META_PROJECTION })
      .toArray()) as unknown as CadFileMeta[]
    const hasNative = files.some((f) => f.kind === 'native')
    const hasStep = files.some((f) => f.kind === 'step')
    // A timed-out auto-submit takes whatever was uploaded; a manual submit needs both files.
    if (!autoSubmitted && (!hasNative || !hasStep)) {
      return NextResponse.json({ error: 'Upload both your native CAD file and the STEP export before submitting.' }, { status: 400 })
    }

    const points = Math.max(1, Math.min(1000, Number(exam.cad_points) || CAD_DEFAULT_POINTS))
    const cad: CadSubmissionInfo = { files, rationale, task_code: taskCode }
    const now = nowIso()
    const ua = req.headers.get('user-agent') || ''
    const submission = {
      id: newId(),
      exam_id: examId,
      user_id: userId,
      email,
      source: access.source === 'invite' ? 'invite' : 'public_link',
      kind: 'cad',
      answers: { [CAD_TASK_QID]: rationale },
      score: 0,
      max_score: points,
      has_pending_review: true,
      auto_submitted: autoSubmitted,
      details: [{ qId: CAD_TASK_QID, correct: false, points, answer: rationale, pending_review: true }],
      cad,
      device_info: {
        ua,
        ...parseUserAgent(ua),
        ip: clientIp,
        geo: req.headers.get('cf-ipcountry') || req.headers.get('x-vercel-ip-country') || null,
      },
      question_timings: {},
      total_time_ms: totalTimeMs,
      started_at: startedAt,
      submitted_at: now,
      created_at: now,
    }

    const stored = await recordExamAttempt(db, access.current, submission, access.attemptNo)
    if (!stored.ok) return NextResponse.json({ error: 'This attempt was already submitted.' }, { status: 409 })

    await db.collection('exam_submission_files').updateMany(
      { exam_id: examId, user_id: userId, status: 'staged', id: { $in: files.map((f) => f.id) } },
      { $set: { status: 'submitted', submission_id: submission.id, attempt_no: access.attemptNo } },
    )

    if (access.invite && inviteToken) {
      await db.collection('candidate_invites').updateOne(
        { token: inviteToken },
        { $set: { status: 'used', updatedAt: now, user_id: userId, email } },
      ).catch(() => {})
    }

    return NextResponse.json({
      ok: true,
      submission_id: submission.id,
      has_pending_review: true,
      released: false,
      attempt_no: access.attemptNo,
      max_attempts: access.maxAttempts,
    })
  } catch (e) {
    console.error('[cad-submission] POST:', e)
    return NextResponse.json({ error: 'Submit failed' }, { status: 500 })
  }
}
