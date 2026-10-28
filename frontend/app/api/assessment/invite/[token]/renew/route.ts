import { NextRequest, NextResponse } from 'next/server'
import { candidateInvites } from '@/lib/db/admin'
import { getMongoDb } from '@/lib/mongodb'
import { sendEmail } from '@/lib/send-email'
import { emailLongDate, emailTemplatesFor } from '@/lib/email-templates'
import { localeForRecipient } from '@/lib/i18n/recipient'
import { newId, nowIso } from '@/lib/db/ai'
import { requireAuth } from '@/lib/route-auth'
import { examIdFromTargetUrl } from '@/lib/exam-access'
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'

/** Self-service renewals per invite; after that the organiser has to resend. */
const MAX_RENEWALS = 3

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const gate = await requireAuth().catch(() => null)
  if (!gate || 'error' in gate) {
    return NextResponse.json({ error: 'You must be signed in to renew an invitation', code: 'invite_renew_signin' }, { status: 401 })
  }

  const { token } = await ctx.params
  if (!token) {
    return NextResponse.json({ error: 'Token required', code: 'token_required' }, { status: 400 })
  }

  const rl = rateLimitSlidingWindow(`invite-renew:${gate.user.id}`, 5, 60 * 60_000)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.', code: 'rate_limited_later' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })
  }

  try {
    const col = await candidateInvites()
    const invite = await col.findOne({ token })

    if (!invite) {
      return NextResponse.json({ error: 'Invitation not found', code: 'invite_not_found' }, { status: 404 })
    }

    // The signed-in account must own this invitation
    if ((invite.email || '').toLowerCase() !== (gate.user.email || '').toLowerCase()) {
      return NextResponse.json({ error: 'This invitation belongs to a different account', code: 'invite_other_account' }, { status: 403 })
    }

    if (invite.status === 'used') {
      return NextResponse.json({ error: 'This invitation has already been used to complete the assessment.', code: 'invite_completed' }, { status: 409 })
    }
    // Only an invite that simply ran out of time can be renewed. Revoked or
    // replaced invites (status expired/revoked without the date reason) can't.
    const inv = invite as typeof invite & { expired_reason?: string; renew_count?: number; exam_id?: string }
    const dateExpired = !!invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()
    const renewableStatus = invite.status === 'pending' || invite.status === 'active'
      || ((invite.status as string) === 'expired' && inv.expired_reason === 'date')
    if (!dateExpired || !renewableStatus) {
      return NextResponse.json({ error: dateExpired ? 'This invitation is no longer valid. Contact the organiser for a new one.' : 'This invitation is still valid.' }, { status: 409 })
    }
    if ((Number(inv.renew_count) || 0) >= MAX_RENEWALS) {
      return NextResponse.json({ error: 'This invitation can’t be renewed again. Contact the organiser for a new one.', code: 'invite_renew_limit' }, { status: 409 })
    }

    // Find the exam (title for the email; no renewal once the test has closed).
    const examId = inv.exam_id || examIdFromTargetUrl(invite.target_url)
      || (Array.isArray(invite.assigned_assessments) ? invite.assigned_assessments.map((s) => examIdFromTargetUrl(s?.target_url)).find(Boolean) : null)
      || ''
    const db = await getMongoDb()
    const exam = examId ? await db.collection('exams').findOne({ id: examId }) : null
    if (exam && (!exam.published || (exam.ends_at && new Date(String(exam.ends_at)).getTime() < Date.now()))) {
      return NextResponse.json({ error: 'This assessment is closed.', code: 'assessment_closed' }, { status: 409 })
    }

    // Generate new token and 48-hour expiration
    const newToken = crypto.randomUUID()
    const newExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    const locale = await localeForRecipient({ userId: gate.user.id, email: invite.email })
    const expiresStr = emailLongDate(newExpiresAt, locale)

    // Conditional on the token we read, so two concurrent renews can't both win.
    const swapped = await db.collection('candidate_invites').updateOne(
      { token, status: invite.status },
      {
        $set: { token: newToken, expires_at: newExpiresAt, status: 'pending', updatedAt: nowIso() },
        $unset: { expired_reason: '' },
        $inc: { renew_count: 1 },
      },
    )
    if (swapped.modifiedCount !== 1) {
      return NextResponse.json({ error: 'This invitation was already renewed. Check your email.', code: 'invite_already_renewed' }, { status: 409 })
    }

    const examTitle = exam?.title || 'Technical Assessment'

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const inviteUrl = `${appUrl}/assessment/invite/${newToken}`

    const template = emailTemplatesFor(locale).assessmentInvite({
      candidateName: invite.full_name || invite.email,
      examTitle,
      inviteUrl,
      expiresIn: expiresStr,
    })

    const emailResult = await sendEmail(invite.email, template)

    // Store Postal message ID for delivery tracking if available
    if (emailResult.postalMessageId) {
      await col.updateOne(
        { token: newToken },
        { $set: { postal_message_id: emailResult.postalMessageId, delivery_status: 'sending' } }
      )
    }

    if (!emailResult.success) {
      // The new link exists but never reached the candidate — say so instead of faking success.
      // Roll back so the candidate can simply try again.
      await db.collection('candidate_invites').updateOne(
        { token: newToken },
        {
          $set: { token, expires_at: invite.expires_at, status: invite.status, ...(inv.expired_reason ? { expired_reason: inv.expired_reason } : {}) },
          $inc: { renew_count: -1 },
        },
      ).catch(() => {})
      return NextResponse.json({ error: 'We couldn’t send the new link. Please try again later or contact the organiser.', code: 'invite_renew_send_failed' }, { status: 502 })
    }

    return NextResponse.json({ 
      success: true, 
      message: 'A new invitation link has been generated and sent to your email.' 
    })
  } catch (e: unknown) {
    const msg = 'Failed to renew invite link'
    console.error('[CodeSpectra] candidate invite renew error:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
