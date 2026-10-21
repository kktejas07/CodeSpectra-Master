/**
 * POST/GET /api/cron/daily-digest — one email per opted-in user summarising
 * their notifications from the last 24 hours. Opt-in via the "Daily digest"
 * switch (notification_preferences { type: 'digest', daily: true }).
 * Users with nothing new get no email. Quiet hours defer the send.
 * Auth: CRON_SECRET (Authorization: Bearer header). Recommended: daily 08:00 UTC.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/cron-heartbeat'
import { getMongoDb } from '@/lib/mongodb'
import { claimDigestSend, deliverOrDefer, escapeHtml, getDigestRecipients } from '@/lib/notifications-delivery'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authorize(req: NextRequest): boolean {
  return isCronAuthorized(req)
}

async function handle(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  }

  try {
    const db = await getMongoDb()
    const since = new Date(Date.now() - 86400_000).toISOString()
    const period = new Date().toISOString().slice(0, 10)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://codespectra.ai'
    const recipients = await getDigestRecipients('daily', db)

    let sent = 0
    let deferred = 0
    let empty = 0
    for (const user of recipients) {
      try {
        const items = await db.collection('notifications')
          .find({ user_id: user.id, created_at: { $gte: since } }, { projection: { _id: 0, title: 1, message: 1, link: 1 } })
          .sort({ created_at: -1 })
          .limit(11)
          .toArray()
        if (items.length === 0) { empty++; continue }
        if (!(await claimDigestSend(db, 'daily', user.id, period))) continue

        const shown = items.slice(0, 10)
        const more = items.length > 10 ? '<p style="margin:12px 0 0;color:#6b7280">…and more in your inbox.</p>' : ''
        const rows = shown.map((n) => `
          <li style="margin:0 0 12px">
            <strong>${escapeHtml(n.title)}</strong>
            ${n.message ? `<br><span style="color:#4b5563">${escapeHtml(n.message)}</span>` : ''}
          </li>`).join('')
        const html = `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h2 style="color:#1a1a2e;margin:0 0 8px">Your daily digest</h2>
            <p>Hi ${escapeHtml(user.name)}, here's what you got in the last 24 hours:</p>
            <ul style="padding-left:18px;margin:16px 0">${rows}</ul>${more}
            <a href="${appUrl}/dashboard/notifications" style="display:inline-block;background:#6c5ce7;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600">Open notifications</a>
            <p style="color:#9ca3af;font-size:12px;margin-top:24px">You can turn off the daily digest in <a href="${appUrl}/dashboard/notifications/preferences">notification preferences</a>.</p>
          </div>`
        const r = await deliverOrDefer(user.id, {
          // 'engagement': honours unsubscribes and gets the one-click unsubscribe link + headers (AUTO-052).
          email: { to: user.email, subject: `Your CodeSpectra daily digest (${items.length > 10 ? '10+' : items.length} new)`, html, category: 'engagement' },
        })
        if (r === 'deferred') deferred++
        else sent++
      } catch (e) {
        console.error('[daily-digest] send failed:', e)
      }
    }

    return NextResponse.json({ sent, deferred, empty, recipients: recipients.length })
  } catch (e) {
    console.error('[daily-digest] error:', e)
    return NextResponse.json({ error: 'Failed to send digest' }, { status: 500 })
  }
}

const cronDailyDigest = withCronHeartbeat('daily-digest', handle)
export const POST = cronDailyDigest
export const GET = cronDailyDigest
