import { formatDate } from '@/lib/format-datetime'
import { NextRequest, NextResponse } from 'next/server'
import { candidateInvites } from '@/lib/db/admin'
import { getMongoDb } from '@/lib/mongodb'
import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'
import { newId, nowIso } from '@/lib/db/ai'
import { requireAuth } from '@/lib/route-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const gate = await requireAuth().catch(() => null)
  if (!gate || 'error' in gate) {
    return NextResponse.json({ error: 'You must be signed in to renew an invitation' }, { status: 401 })
  }

  const { token } = await ctx.params
  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 })
  }

  try {
    const col = await candidateInvites()
    const invite = await col.findOne({ token })

    if (!invite) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
    }

    // The signed-in account must own this invitation
    if ((invite.email || '').toLowerCase() !== (gate.user.email || '').toLowerCase()) {
      return NextResponse.json({ error: 'This invitation belongs to a different account' }, { status: 403 })
    }

    if (invite.status === 'used' || invite.status === 'active') {
      return NextResponse.json({ error: 'This invitation has already been used to complete the assessment.' }, { status: 409 })
    }

    // Generate new token and 48-hour expiration
    const newToken = crypto.randomUUID()
    const newExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    const expiresStr = formatDate(newExpiresAt, undefined, { month: 'long', day: 'numeric', year: 'numeric' })

    await col.updateOne(
      { token },
      { 
        $set: { 
          token: newToken, 
          expires_at: newExpiresAt, 
          status: 'pending',
          updatedAt: nowIso()
        } 
      }
    )

    // Find the exam title
    let examId = ''
    if (invite.target_url) {
      const match = invite.target_url.match(/\/exams\/([a-zA-Z0-9_-]+)/)
      if (match) examId = match[1]
    }
    if (!examId && invite.assigned_assessments && invite.assigned_assessments.length > 0) {
      const match = invite.assigned_assessments[0].target_url.match(/\/exams\/([a-zA-Z0-9_-]+)/)
      if (match) examId = match[1]
    }

    const db = await getMongoDb()
    const exam = examId ? await db.collection('exams').findOne({ id: examId }) : null
    const examTitle = exam?.title || 'Technical Assessment'

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const inviteUrl = `${appUrl}/assessment/invite/${newToken}`

    const template = emailTemplates.assessmentInvite({
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
