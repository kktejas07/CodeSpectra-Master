import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/cron-heartbeat'
import { getMongoDb } from '@/lib/mongodb'
import { sendWhatsAppText } from '@/lib/whatsapp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authorize(req: NextRequest): boolean {
  return isCronAuthorized(req)
}

async function postImpl(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = await getMongoDb()
    const { sendEmail } = await import('@/lib/send-email')
    const { emailTemplates } = await import('@/lib/email-templates')
    const { formatDate } = await import('@/lib/format-datetime')
    const { examIdFromTargetUrl } = await import('@/lib/exam-access')

    // Invites that close within the next 24 h, still unused, not yet reminded.
    // `reminded_at` makes each invite get one reminder however often this runs.
    const now = new Date()
    const soon = new Date(now.getTime() + 24 * 3600_000)
    const dueInvites = await db.collection('candidate_invites')
      .find({
        status: { $in: ['pending', 'active'] },
        expires_at: { $gt: now.toISOString(), $lte: soon.toISOString() },
        reminded_at: { $exists: false },
      })
      .limit(200)
      .toArray()

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    let reminded = 0
    let failed = 0
    for (const invite of dueInvites) {
      const examId = (invite.exam_id as string | undefined) || examIdFromTargetUrl(invite.target_url)
      const exam = examId ? await db.collection('exams').findOne({ id: examId }, { projection: { _id: 0, title: 1, published: 1 } }) : null
      if (examId && (!exam || !exam.published)) continue
      // Already submitted: no reminder.
      if (examId && await db.collection('exam_submissions').findOne(
        { exam_id: examId, $or: [{ email: invite.email }, ...(invite.user_id ? [{ user_id: invite.user_id }] : [])] },
        { projection: { _id: 1 } },
      )) continue

      // Claim first so two overlapping runs can't both send.
      const claim = await db.collection('candidate_invites').updateOne(
        { id: invite.id, reminded_at: { $exists: false } },
        { $set: { reminded_at: now.toISOString() } },
      )
      if (claim.modifiedCount !== 1) continue

      let ok = false
      try {
        const result = await sendEmail(String(invite.email), emailTemplates.assessmentReminder({
          candidateName: invite.full_name || invite.email,
          examTitle: (exam?.title as string) || 'Technical Assessment',
          inviteUrl: `${appUrl}/assessment/invite/${invite.token}`,
          expiresIn: formatDate(new Date(String(invite.expires_at)), undefined, { month: 'long', day: 'numeric', year: 'numeric' }),
        }))
        ok = result.success
      } catch (e) {
        console.error('[exam-reminders] email failed:', e)
      }
      if (invite.phone) {
        try {
          await sendWhatsAppText(
            invite.phone,
            `Hi ${invite.full_name || 'there'}! Reminder: your CodeSpectra assessment invitation closes soon. Check your email for the link.`
          )
          ok = true
        } catch { /* best-effort */ }
      }
      if (ok) reminded++
      else {
        failed++
        // Let the next run retry a reminder that never went out.
        await db.collection('candidate_invites').updateOne({ id: invite.id }, { $unset: { reminded_at: '' } }).catch(() => {})
      }
    }

    return NextResponse.json({ reminded, failed, due: dueInvites.length })
  } catch (e) {
    console.error('[exam-reminders] error:', e)
    return NextResponse.json({ error: 'Failed to send reminders' }, { status: 500 })
  }
}

export const POST = withCronHeartbeat('exam-reminders', postImpl)

export async function GET(req: NextRequest) {
  return POST(req)
}
