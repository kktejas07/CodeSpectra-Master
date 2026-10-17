import { formatDate } from '@/lib/format-datetime'
import { NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'
import { inviteIsForExam } from '@/lib/exam-access'
import { sanitizeRegex } from '@/lib/sanitize'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id: examId } = await params

  try {
    const db = await getMongoDb()

    const owned = await requireTenantEntity(db, 'exams', examId, gate.user)
    if ('error' in owned) {
      return NextResponse.json({ error: owned.error }, { status: owned.status })
    }
    const exam = owned.doc

    // Still-valid invites for exactly this exam, from candidates who haven't submitted.
    const nowIso = new Date().toISOString()
    const candidates = await db.collection('candidate_invites').find({
      $or: [{ exam_id: examId }, { target_url: { $regex: `/assessment/${sanitizeRegex(String(examId))}(?:[/?]|$)` } }],
      status: { $in: ['pending', 'active'] },
      expires_at: { $gt: nowIso },
    }).toArray()
    const submitted = new Set(
      (await db.collection('exam_submissions').find({ exam_id: examId }, { projection: { _id: 0, email: 1, user_id: 1 } }).toArray())
        .flatMap((s) => [String(s.email || '').toLowerCase(), String(s.user_id || '')]).filter(Boolean),
    )
    const pendingInvites = candidates.filter((inv) => inviteIsForExam(inv as Record<string, unknown>, examId)
      && !submitted.has(String(inv.email || '').toLowerCase()) && !(inv.user_id && submitted.has(String(inv.user_id))))

    if (pendingInvites.length === 0) {
      return NextResponse.json({ message: 'No pending invites to remind', sent: 0, total: 0 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const examTitle = exam.title || 'Technical Assessment'
    let sent = 0
    const errors: string[] = []

    for (const invite of pendingInvites) {
      try {
        const inviteUrl = `${appUrl}/assessment/invite/${invite.token}`
        const expiresAt = new Date(invite.expires_at)
        const expiresStr = formatDate(expiresAt, undefined, { month: 'long', day: 'numeric', year: 'numeric' })

        const template = emailTemplates.assessmentReminder({
          candidateName: invite.full_name || invite.email,
          examTitle,
          inviteUrl,
          expiresIn: expiresStr,
        })

        const result = await sendEmail(invite.email, template)

        await db.collection('candidate_invites').updateOne(
          { id: invite.id },
          {
            $set: {
              ...(result.postalMessageId ? { postal_message_id: result.postalMessageId } : {}),
              delivery_status: result.success ? 'sent' : 'failed',
              delivery_updated_at: new Date().toISOString(),
              ...(result.success ? {} : { delivery_error: 'Reminder send failed' }),
            },
          }
        )
        if (result.success) sent++
        else errors.push(`Failed for ${invite.email}`)
      } catch (e) {
        console.error('[remind] send failed:', e)
        errors.push(`Failed for ${invite.email}`)
      }
    }

    return NextResponse.json({
      success: sent > 0,
      sent,
      total: pendingInvites.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (e: unknown) {
    const msg = 'Failed to send reminders'
    console.error('[CodeSpectra] admin/exams/[id]/invites/remind POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
