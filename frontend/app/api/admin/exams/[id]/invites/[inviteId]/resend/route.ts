import { formatDate } from '@/lib/format-datetime'
import { NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'
import { inviteIsForExam } from '@/lib/exam-access'

/** A resent link that had run out gets this much more time. */
const RESEND_EXTEND_MS = 7 * 24 * 3600 * 1000

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id: examId, inviteId } = await params

  try {
    const body = await request.json().catch(() => ({}))
    const isReminder = body.type === 'reminder'

    const db = await getMongoDb()

    const owned = await requireTenantEntity(db, 'exams', examId, gate.user)
    if ('error' in owned) {
      return NextResponse.json({ error: owned.error }, { status: owned.status })
    }
    const exam = owned.doc

    const invite = await db.collection('candidate_invites').findOne({ id: inviteId })
    // The invite must belong to this (tenant-checked) exam.
    if (!invite || !inviteIsForExam(invite as Record<string, unknown>, examId)) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    }
    if (invite.status === 'revoked' || invite.status === 'used') {
      return NextResponse.json({ error: invite.status === 'used' ? 'This candidate has already used the invite.' : 'This invite was withdrawn. Send a new invite instead.' }, { status: 409 })
    }
    if (exam.ends_at && new Date(String(exam.ends_at)).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This assessment is closed. Extend its deadline first.' }, { status: 409 })
    }

    // An expired link would arrive dead: give it more time before mailing it.
    let expiresAt = new Date(invite.expires_at)
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      expiresAt = new Date(Date.now() + RESEND_EXTEND_MS)
      await db.collection('candidate_invites').updateOne(
        { id: inviteId },
        { $set: { expires_at: expiresAt.toISOString(), status: 'pending', updated_at: new Date().toISOString() }, $unset: { expired_reason: '' } },
      )
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const inviteUrl = `${appUrl}/assessment/invite/${invite.token}`

    const expiresStr = formatDate(expiresAt, undefined, { month: 'long', day: 'numeric', year: 'numeric' })

    const template = isReminder
      ? emailTemplates.assessmentReminder({
          candidateName: invite.full_name || invite.email,
          examTitle: exam.title || 'Technical Assessment',
          inviteUrl,
          expiresIn: expiresStr,
        })
      : emailTemplates.assessmentInvite({
          candidateName: invite.full_name || invite.email,
          examTitle: exam.title || 'Technical Assessment',
          inviteUrl,
          expiresIn: expiresStr,
        })

    const result = await sendEmail(invite.email, template)

    // Store Postal message ID for delivery tracking
    if (result.postalMessageId) {
      await db.collection('candidate_invites').updateOne(
        { id: inviteId },
        { $set: { postal_message_id: result.postalMessageId, delivery_status: 'sending' } }
      )
    }

    if (!result.success) {
      return NextResponse.json({ error: 'The email could not be sent. Try again later.', success: false }, { status: 502 })
    }

    return NextResponse.json({
      success: result.success,
      provider: result.provider,
      type: isReminder ? 'reminder' : 'resend',
      postalMessageId: result.postalMessageId,
    })
  } catch (e: unknown) {
    const msg = 'Failed to resend invite'
    console.error('[CodeSpectra] admin/exams/[id]/invites/[inviteId]/resend POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
