import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'

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

    const exam = await db.collection('exams').findOne({ id: examId })
    if (!exam) {
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    }

    const invite = await db.collection('candidate_invites').findOne({ id: inviteId })
    if (!invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const inviteUrl = `${appUrl}/assessment/invite/${invite.token}`

    const expiresAt = new Date(invite.expires_at)
    const expiresStr = expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

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

    return NextResponse.json({
      success: result.success,
      provider: result.provider,
      type: isReminder ? 'reminder' : 'resend',
      postalMessageId: result.postalMessageId,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to resend invite'
    console.error('[CodeSpectra] admin/exams/[id]/invites/[inviteId]/resend POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
