import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/cron-heartbeat'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authorize(req: NextRequest): boolean {
  return isCronAuthorized(req)
}

async function postImpl(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  }

  try {
    const db = await getMongoDb()
    const { sendEmail } = await import('@/lib/send-email')
    const { emailLongDate, emailTemplatesFor } = await import('@/lib/email-templates')
    const { localeForRecipient } = await import('@/lib/i18n/recipient')
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
    let capped = 0
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
        // reminder_count / reminder_steps: shown on the results page ("reminded 2×") and shared with the W15 invite ladder.
        { $set: { reminded_at: now.toISOString(), last_reminded_at: now.toISOString() }, $inc: { reminder_count: 1 }, $addToSet: { reminder_steps: '24h' } },
      )
      if (claim.modifiedCount !== 1) continue

      const inviteUserId = typeof invite.user_id === 'string' && invite.user_id
        ? invite.user_id
        : String((await db.collection('user').findOne({ email: String(invite.email).toLowerCase() }, { projection: { id: 1 } }))?.id || '')
      // A deadline reminder through the shared per-person budget (AUTO-094): counts toward the
      // cap with the extra deadline slot; held ones are retried by the next run (unclaimed below).
      const { withBudget } = await import('@/lib/messaging/budget')
      const outcome = await withBudget({ userId: inviteUserId || null, email: String(invite.email) }, { class: 'deadline', topic: 'test-invite-reminder', object: `${String(invite.id)}:24h`, source: 'exam-reminders' }, async () => {
        let sent = false
        try {
          const locale = await localeForRecipient({ userId: typeof invite.user_id === 'string' ? invite.user_id : null, email: String(invite.email) })
          const result = await sendEmail(String(invite.email), emailTemplatesFor(locale).assessmentReminder({
            candidateName: invite.full_name || invite.email,
            examTitle: (exam?.title as string) || 'Technical Assessment',
            inviteUrl: `${appUrl}/assessment/invite/${invite.token}`,
            expiresIn: emailLongDate(new Date(String(invite.expires_at)), locale),
          }))
          sent = result.success
        } catch (e) {
          console.error('[exam-reminders] email failed:', e)
        }
        // WhatsApp only for an account holder who agreed to WhatsApp (never to the raw invite
        // phone), through the official channel — lib/whatsapp-send (AUTO-060).
        if (inviteUserId) {
          try {
            const { sendWhatsAppToUser } = await import('@/lib/whatsapp-send')
            const r = await sendWhatsAppToUser(inviteUserId, {
              kind: 'notification',
              title: 'Assessment reminder',
              text: `Your invitation for ${(exam?.title as string) || 'a CodeSpectra assessment'} closes soon. Check your email for the link.`,
            })
            if (r.sent) sent = true
          } catch { /* best-effort */ }
        }
        return sent
      }, now)
      const ok = outcome === 'sent' || outcome === 'duplicate'
      if (ok) reminded++
      else {
        if (outcome === 'capped') capped++
        else failed++
        // Let the next run retry a reminder that never went out.
        await db.collection('candidate_invites').updateOne({ id: invite.id }, { $unset: { reminded_at: '' }, $inc: { reminder_count: -1 }, $pull: { reminder_steps: '24h' } } as never).catch(() => {})
      }
    }

    return NextResponse.json({ reminded, failed, capped, due: dueInvites.length })
  } catch (e) {
    console.error('[exam-reminders] error:', e)
    return NextResponse.json({ error: 'Failed to send reminders' }, { status: 500 })
  }
}

export const POST = withCronHeartbeat('exam-reminders', postImpl)

export async function GET(req: NextRequest) {
  return POST(req)
}
