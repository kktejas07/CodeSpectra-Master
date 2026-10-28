import { NextRequest, NextResponse } from 'next/server'
import { candidateInvites } from '@/lib/db/admin'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/ai'
import { examAttemptPolicy, examIdFromTargetUrl } from '@/lib/exam-access'
import type { Db } from 'mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type InviteLike = { exam_id?: string | null; target_url?: string | null; email?: string | null; user_id?: string | null; status?: string | null }

/** A `used` invite still opens the test when the exam allows another attempt for that candidate. */
async function retakeOpen(db: Db, invite: InviteLike): Promise<boolean> {
  const examId = invite.exam_id || examIdFromTargetUrl(invite.target_url)
  if (!examId) return false
  const exam = await db.collection('exams').findOne({ id: examId })
  if (!exam || !exam.published) return false
  const { maxAttempts } = examAttemptPolicy(exam as Record<string, unknown>)
  if (maxAttempts <= 1) return false
  const who = [...(invite.user_id ? [{ user_id: invite.user_id }] : []), ...(invite.email ? [{ email: invite.email }] : [])]
  if (who.length === 0) return false
  const latest = await db.collection('exam_submissions').findOne({ exam_id: examId, $or: who }, { sort: { created_at: -1 } })
  return (Number(latest?.attempt_no) || (latest ? 1 : 0)) < maxAttempts
}

/** Withdrawn by an organiser (revoked link, replaced by a newer invite) — not renewable. */
function isWithdrawn(invite: { status?: string; expired_reason?: string }): boolean {
  return invite.status === 'revoked' || (invite.status === 'expired' && invite.expired_reason !== 'date')
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params
  if (!token) {
    return NextResponse.json({ error: 'Token required', code: 'token_required' }, { status: 400 })
  }

  try {
    const col = await candidateInvites()
    const invite = await col.findOne({ token })

    if (!invite) {
      return NextResponse.json({ error: 'Invitation not found', code: 'invite_not_found' }, { status: 404 })
    }

    if (isWithdrawn(invite)) {
      return NextResponse.json({ error: 'This invitation is no longer valid. Contact the organiser for a new one.', code: 'invite_invalid' }, { status: 410 })
    }

    const db = await getMongoDb()
    if (invite.status === 'used' && !(await retakeOpen(db, invite))) {
      return NextResponse.json({ error: 'This invitation has already been used.', code: 'invite_used' }, { status: 409 })
    }

    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      await col.updateOne({ token, status: { $in: ['pending', 'active'] } }, { $set: { status: 'expired', expired_reason: 'date' } })
      return NextResponse.json({ error: 'This invitation has expired.', code: 'invite_expired' }, { status: 410 })
    }

    const body = await req.json().catch(() => ({}))
    if (body.email && body.email.toLowerCase() !== (invite.email || '').toLowerCase()) {
      return NextResponse.json({ error: 'Email mismatch — this invitation belongs to a different candidate.', code: 'invite_email_mismatch' }, { status: 403 })
    }

    // Never flip a used invite back to active (it would re-open renew and remind).
    await col.updateOne({ token, status: 'pending' }, { $set: { status: 'active', updatedAt: nowIso() } })

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = 'Failed to use invite token'
    console.error('[assessment/invite/[token]]', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params
  if (!token) {
    return NextResponse.json({ error: 'Token required', code: 'token_required' }, { status: 400 })
  }

  try {
    const col = await candidateInvites()
    const db = await getMongoDb()
    const invite = await col.findOne({ token })

    if (!invite) {
      return NextResponse.json({ error: 'Candidate invitation link invalid or expired.', code: 'candidate_link_invalid' }, { status: 404 })
    }

    if (isWithdrawn(invite)) {
      return NextResponse.json({ error: 'This invitation is no longer valid. Contact the organiser for a new one.', code: 'invite_invalid', is_revoked: true }, { status: 410 })
    }

    if (invite.status === 'used' && !(await retakeOpen(db, invite))) {
      return NextResponse.json({ error: 'This invitation has already been used.', code: 'invite_used', is_expired: true, is_used: true }, { status: 410 })
    }

    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      // Date expiry is the only renewable kind (see renew route).
      await col.updateOne({ token, status: { $in: ['pending', 'active'] } }, { $set: { status: 'expired', expired_reason: 'date' } })
      return NextResponse.json({ error: 'This candidate assessment link has expired.', code: 'candidate_link_expired', is_expired: true }, { status: 410 })
    }

    const registeredUser = await db.collection('user').findOne({ email: invite.email })

    return NextResponse.json({
      ok: true,
      email: invite.email,
      full_name: invite.full_name,
      target_url: invite.target_url || '/assessment',
      is_registered: !!registeredUser,
      assigned_assessments: invite.assigned_assessments || [
        {
          id: 'step-1',
          title: 'Assigned Assessment',
          target_url: invite.target_url || '/assessment',
          type: invite.target_url?.includes('cad') ? 'cad' : invite.target_url?.includes('identity') ? 'identity' : invite.target_url?.includes('problems') ? 'coding' : 'general',
          allowed_languages: invite.allowed_languages || [],
          status: 'pending',
        },
      ],
      allowed_languages: invite.allowed_languages || [],
      status: invite.status,
      created_at: invite.created_at,
    })
  } catch (e: unknown) {
    const msg = 'Failed to verify invite token'
    console.error('[assessment/invite/[token]]', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
