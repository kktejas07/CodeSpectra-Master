import { formatDate } from '@/lib/format-datetime'
import { isCronAuthorized } from '@/lib/cron-auth'
import { NextRequest, NextResponse } from 'next/server'
import { withCronHeartbeat } from '@/lib/cron-heartbeat'
import { getMongoDb } from '@/lib/mongodb'
import { claimDigestSend, deliverOrDefer, escapeHtml, getDigestRecipients } from '@/lib/notifications-delivery'

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
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString()

    const weekAgoDate = new Date(Date.now() - 7 * 86400_000)
    const [newUsers, newSubmissions, newHackathons, newCertifications] = await Promise.all([
      db.collection('user').countDocuments({ createdAt: { $gte: weekAgoDate } }),
      db.collection('exam_submissions').countDocuments({ created_at: { $gte: weekAgo } }),
      db.collection('hackathons').countDocuments({ created_at: { $gte: weekAgo } }),
      db.collection('certifications').countDocuments({ created_at: { $gte: weekAgo } }),
    ])

    // Honour each user's "Weekly report" switch (digest.weekly, default on)
    // and the email channel switch; quiet hours defer the send.
    const subscribers = await getDigestRecipients('weekly', db)

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://codespectra.ai'
    const subject = `CodeSpectra weekly digest — ${formatDate(new Date(), undefined, { month: 'short', day: 'numeric' })}`

    // ISO date of this week's Monday (UTC) — one weekly digest per user per week.
    const monday = new Date()
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
    const period = monday.toISOString().slice(0, 10)

    let sent = 0
    let deferred = 0
    let skipped = 0
    for (const user of subscribers) {
      try {
        if (!(await claimDigestSend(db, 'weekly', user.id, period))) { skipped++; continue }
        const html = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #1a1a2e;">Weekly platform digest</h2>
              <p>Hi ${escapeHtml(user.name)}, here's what happened on CodeSpectra this week:</p>
              <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <p style="margin: 8px 0;"><strong>${newUsers}</strong> new users joined</p>
                <p style="margin: 8px 0;"><strong>${newSubmissions}</strong> new submissions</p>
                <p style="margin: 8px 0;"><strong>${newHackathons}</strong> new hackathons</p>
                <p style="margin: 8px 0;"><strong>${newCertifications}</strong> new certifications</p>
              </div>
              <a href="${appUrl}/dashboard" style="display: inline-block; background: #6c5ce7; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">View dashboard</a>
              <p style="color:#9ca3af;font-size:12px;margin-top:24px">You can turn off the weekly report in <a href="${appUrl}/dashboard/notifications/preferences">notification preferences</a>.</p>
            </div>
          `
        // 'engagement': honours unsubscribes and gets the one-click unsubscribe link + headers (AUTO-052).
        const r = await deliverOrDefer(user.id, { email: { to: user.email, subject, html, category: 'engagement' } })
        if (r === 'deferred') deferred++
        else sent++
      } catch (e) {
        console.error('[weekly-digest] send failed:', e)
      }
    }

    return NextResponse.json({ sent, deferred, skipped, recipients: subscribers.length })
  } catch (e) {
    console.error('[weekly-digest] error:', e)
    return NextResponse.json({ error: 'Failed to send digest' }, { status: 500 })
  }
}

export const POST = withCronHeartbeat('weekly-digest', postImpl)

export async function GET(req: NextRequest) {
  return POST(req)
}
