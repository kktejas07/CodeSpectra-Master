import { isCronAuthorized } from '@/lib/cron-auth'
import { NextRequest, NextResponse } from 'next/server'
import { withCronHeartbeat } from '@/lib/cron-heartbeat'
import { getMongoDb } from '@/lib/mongodb'
import { claimDigestSend, deliverOrDefer, releaseDigestSend } from '@/lib/notifications-delivery'
import { isUnsubscribed } from '@/lib/automation/mailer'
import { withBudget } from '@/lib/messaging/budget'
import { emailTemplatesFor } from '@/lib/email-templates'
import { recipientLocaleFrom } from '@/lib/i18n/recipient'
import { getUserStreak } from '@/lib/activity-streak'
import { weeklyDigestWorthSending, weeklyPeriod, weeklyRecipientFilter, type WeeklyPersonalStats } from '@/lib/digest/weekly-personal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Stop well before maxDuration; the rest of the list is sent on the next (catch-up) run. */
const BUDGET_MS = 240_000

/**
 * Weekly digest (AUTO-080): each recently active learner's own week — problems
 * solved, streak and a few upcoming public events — in their language.
 * Recipients are streamed (no full user list in memory) and claimed per user
 * + week, so a run that hits its time budget answers 200 { partial, remaining } and the
 * next run (platform-cron catch-up window or an external retry) continues where it stopped.
 */
async function postImpl(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  }

  try {
    const db = await getMongoDb()
    const now = new Date()
    const started = Date.now()
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString()
    const period = weeklyPeriod(now)
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://codespectra.ai').replace(/\/+$/, '')

    // Preferences: email channel off, or the "Weekly report" switch (digest.weekly) off.
    const prefs = db.collection('notification_preferences')
    const [emailOff, weeklyOff] = await Promise.all([
      prefs.find({ type: 'email', enabled: false }, { projection: { _id: 0, user_id: 1 } }).toArray(),
      prefs.find({ type: 'digest', weekly: false }, { projection: { _id: 0, user_id: 1 } }).toArray(),
    ])
    const off = new Set([...emailOff, ...weeklyOff].map((p) => String(p.user_id)))

    // Upcoming public events (same for everyone): registration closes within 14 days.
    const events: WeeklyPersonalStats['events'] = (await db.collection('events_feed').find(
      { status: 'published', internal: { $ne: true }, registration_deadline: { $gte: now.toISOString(), $lte: new Date(now.getTime() + 14 * 86_400_000).toISOString() } },
      { projection: { _id: 0, id: 1, title: 1, registration_deadline: 1 } },
    ).sort({ registration_deadline: 1 }).limit(3).toArray().catch(() => []))
      .map((e) => ({ title: String(e.title || '').slice(0, 140), url: `${appUrl}/events/${encodeURIComponent(String(e.id))}`, deadline: e.registration_deadline ? String(e.registration_deadline) : null }))
      .filter((e) => e.title)

    const cursor = db.collection('user')
      .find(weeklyRecipientFilter(now), { projection: { id: 1, _id: 1, email: 1, fullName: 1, name: 1, ui_locale: 1 } })
      .sort({ _id: 1 })

    let sent = 0
    let deferred = 0
    let skipped = 0
    let capped = 0
    let empty = 0
    let checked = 0
    let outOfTime = false
    let remaining = 0
    for await (const u of cursor) {
      if (outOfTime || Date.now() - started > BUDGET_MS) { outOfTime = true; remaining++; continue }
      checked++
      const id = String(u.id ?? u._id)
      if (off.has(id)) continue
      try {
        // Unsubscribed by link: nothing would go out, so don't claim it or use a slot (AUTO-116).
        if (!u.email || (await isUnsubscribed(String(u.email), 'engagement'))) { skipped++; continue }
        if (!(await claimDigestSend(db, 'weekly', id, period))) { skipped++; continue }
        const [solved, streak] = await Promise.all([
          // created_at is an ISO string on new rows and a Date on old ones.
          db.collection('submissions').countDocuments({ user_id: id, status: 'accepted', $or: [{ created_at: { $gte: weekAgo } }, { created_at: { $gte: new Date(weekAgo) } }] }).catch(() => 0),
          getUserStreak(id).then((s) => s.current).catch(() => 0),
        ])
        const stats: WeeklyPersonalStats = { solved, streak, events }
        if (!weeklyDigestWorthSending(stats)) { empty++; continue }
        const msg = emailTemplatesFor(recipientLocaleFrom(u as { ui_locale?: unknown })).weeklyDigestEmail({
          name: String(u.fullName || u.name || '').split(' ')[0] || String(u.email).split('@')[0], ...stats,
        })
        // 'engagement': honours unsubscribes and gets the one-click unsubscribe link + headers (AUTO-052).
        // A digest counts toward the shared per-person messaging budget (AUTO-094).
        const res: { r?: Awaited<ReturnType<typeof deliverOrDefer>> } = {}
        const outcome = await withBudget({ userId: id, email: String(u.email) }, { class: 'digest', topic: 'weekly-digest', object: period, source: 'weekly-digest' }, async () => {
          res.r = await deliverOrDefer(id, { email: { to: String(u.email), subject: msg.subject, html: msg.html, category: 'engagement' } })
          return true
        })
        if (outcome !== 'sent') {
          skipped++
          // Held by the shared limit: unclaimed, so the catch-up run later this week can still send it (AUTO-109).
          if (outcome === 'capped') { capped++; await releaseDigestSend(db, 'weekly', id, period) }
        } else if (res.r === 'deferred') deferred++
        else sent++
      } catch (e) {
        console.error('[weekly-digest] send failed:', (e as Error)?.message)
      }
    }

    // Stopping at the time budget is progress, not failure: 200 + x-cron-partial so the heartbeat stays ok and
    // the next catch-up run continues (per-user claims prevent repeats). Only real errors return 5xx.
    const body = { sent, deferred, skipped, capped, empty, checked, period, ...(outOfTime ? { partial: true, remaining } : {}) }
    return NextResponse.json(body, { status: 200, headers: outOfTime ? { 'x-cron-partial': '1' } : undefined })
  } catch (e) {
    console.error('[weekly-digest] error:', (e as Error)?.message)
    return NextResponse.json({ error: 'Failed to send digest' }, { status: 500 })
  }
}

export const POST = withCronHeartbeat('weekly-digest', postImpl)

export async function GET(req: NextRequest) {
  return POST(req)
}
