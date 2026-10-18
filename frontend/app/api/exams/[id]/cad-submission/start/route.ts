/**
 * POST /api/exams/[id]/cad-submission/start — the candidate pressed Start on a
 * CAD task (after the identity / proctoring checks). Records the start time
 * server-side in the candidate's draft record (exam_drafts) for the current
 * attempt, so the timer survives refreshes and device switches and the
 * submission's started_at / total_time_ms come from the server, not the client.
 *
 * Idempotent per attempt: pressing Start again (or reloading and resuming)
 * returns the original start time. A new attempt gets a fresh start time.
 *
 * Body: { inviteToken?, linkToken? } — same entry checks as the submit route.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/ids'
import { checkExamEntry, checkIdentityForAttempt, isCadExam } from '@/lib/exam-access'
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth().catch(() => null)
  if (!gate || 'error' in gate) {
    return NextResponse.json({ error: 'You must be signed in to take this assessment.' }, { status: 401 })
  }
  const { id: userId, email } = gate.user
  const { id: examId } = await ctx.params

  const rl = rateLimitSlidingWindow(`cad-start:${userId}:${examId}`, 30, 10 * 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const inviteToken = typeof body.inviteToken === 'string' ? body.inviteToken : null
  const linkToken = typeof body.linkToken === 'string' ? body.linkToken : null

  try {
    const db = await getMongoDb()
    const exam = await db.collection('exams').findOne({ id: examId })
    if (!exam || exam.published === false) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

    if (!isCadExam(exam as Record<string, unknown>)) return NextResponse.json({ error: 'This assessment is not a CAD task.' }, { status: 400 })

    const access = await checkExamEntry(db, exam as Record<string, unknown>, { id: userId, email }, { inviteToken, linkToken }, { claimLinkUse: true })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    // Identity check stored for this attempt first (POST ../../identity).
    const identity = await checkIdentityForAttempt(db, exam as Record<string, unknown>, userId, access.attemptNo)
    if (!identity.ok) {
      return NextResponse.json({ error: identity.error, identity_required: true }, { status: identity.status })
    }

    const now = nowIso()
    // Atomic keep-or-set: the start time only changes when this is a new
    // attempt, so concurrent Start clicks / reloads all see the same value.
    const doc = await db.collection('exam_drafts').findOneAndUpdate(
      { exam_id: examId, user_id: userId },
      [{
        $set: {
          cad_started_at: { $cond: [{ $eq: ['$cad_started_attempt', access.attemptNo] }, '$cad_started_at', now] },
          cad_started_attempt: access.attemptNo,
          updated_at: now,
          created_at: { $ifNull: ['$created_at', now] },
        },
      }],
      { upsert: true, returnDocument: 'after', projection: { _id: 0, cad_started_at: 1 } },
    )
    const startedAt = typeof doc?.cad_started_at === 'string' ? doc.cad_started_at : now

    return NextResponse.json({
      ok: true,
      started_at: startedAt,
      server_now: new Date().toISOString(),
      duration_minutes: Math.max(0, Number(exam.duration) || 0),
      attempt_no: access.attemptNo,
    })
  } catch (e) {
    console.error('[cad-submission/start] POST:', e)
    return NextResponse.json({ error: 'Could not start the test' }, { status: 500 })
  }
}
