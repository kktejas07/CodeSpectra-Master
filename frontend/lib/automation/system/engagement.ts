/**
 * Engagement automations:
 *   AU-10  onboarding: verify-your-email nudge after 24 h, first-steps tips after 3 quiet days
 *   AU-11  abandoned marketplace checkout (event-driven: marketplace.checkout.created / order.paid)
 *   AU-12  re-engagement at 7 / 14 / 30 days without a sign-in + evening streak saver
 *   AU-16  certificate follow-up (add to LinkedIn) + expiry reminders 30 days ahead
 * All engagement email honours unsubscribes and the user's email switch.
 */
import { getMongoDb } from '@/lib/mongodb'
import { getAppOrigin } from '@/lib/app-origin'
import { emit } from '../events'
import { cancelJobs, scheduleJob } from '../jobs'
import { sendAutomationEmail } from '../mailer'
import { claimOnce } from '../store'
import { inactivityBucket, INACTIVE_STEPS, linkedInAddUrl, localHour } from './rules'
import type { SystemAutomation } from './types'

type Doc = Record<string, unknown>

async function loadUser(userId: string): Promise<Doc | null> {
  const db = await getMongoDb()
  return (await db.collection('user').findOne({ $or: [{ id: userId }, { _id: userId as never }] }, { projection: { id: 1, _id: 1, email: 1, name: 1, fullName: 1, emailVerified: 1, isActive: 1, deleted_at: 1 } })) as Doc | null
}
const nameOf = (u: Doc) => String(u.fullName || u.name || 'there').split(' ')[0]

// ─── AU-10 onboarding ───────────────────────────────────────────────────────

async function onboardingVerify(p: Doc): Promise<unknown> {
  const u = await loadUser(String(p.user_id))
  if (!u?.email || u.emailVerified === true || u.isActive === false || u.deleted_at) return { skipped: true }
  return sendAutomationEmail({
    to: String(u.email), userId: String(u.id || u._id), category: 'engagement', onceKey: `onboard-verify:${String(u.id || u._id)}`,
    subject: 'One step left: confirm your email',
    heading: 'Confirm your email to get started',
    bodyText: `Hi ${nameOf(u)},\n\nYou’re nearly set up. Sign in and press “Resend verification” on your dashboard to get a fresh link — it unlocks tests, events and certificates.`,
    cta: { label: 'Sign in', url: '/login' },
    reason: 'You got this email because you created a CodeSpectra account.',
  })
}

async function onboardingTips(p: Doc): Promise<unknown> {
  const u = await loadUser(String(p.user_id))
  if (!u?.email || u.isActive === false || u.deleted_at) return { skipped: true }
  const db = await getMongoDb()
  const uid = String(u.id || u._id)
  const [subs, tests] = await Promise.all([
    db.collection('submissions').countDocuments({ user_id: uid }, { limit: 1 }),
    db.collection('exam_submissions').countDocuments({ user_id: uid }, { limit: 1 }),
  ])
  if (subs || tests) return { skipped: 'active' }
  return sendAutomationEmail({
    to: String(u.email), userId: uid, category: 'engagement', onceKey: `onboard-tips:${uid}`,
    subject: 'Three quick ways to start on CodeSpectra',
    heading: `Welcome, ${nameOf(u)}`,
    bodyText: '1. Solve today’s practice problem — ten minutes is enough to start a streak.\n2. Take a short mock test to see where you stand.\n3. Browse upcoming hackathons and register with friends.',
    cta: { label: 'Solve your first problem', url: '/dashboard/arena' },
    reason: 'You got this email because you recently created a CodeSpectra account.',
  })
}

// ─── AU-11 abandoned marketplace checkout ───────────────────────────────────

async function abandonedCheckout(p: Doc): Promise<unknown> {
  const db = await getMongoDb()
  const orderId = String(p.order_id || '')
  if (!orderId) return { skipped: true }
  const paid = await db.collection('automation_events').countDocuments({ type: 'marketplace.order.paid', 'payload.order_id': orderId }, { limit: 1 })
  if (paid) return { skipped: 'paid' }
  const email = typeof p.buyer_email === 'string' ? p.buyer_email : ''
  if (!email) return { skipped: 'no email' }
  const raw = String(p.resume_url || '')
  // Only links back into this site.
  const origin = getAppOrigin()
  const url = raw.startsWith('/') && !raw.startsWith('//') ? raw : raw.startsWith(origin + '/') ? raw : '/marketplace'
  return sendAutomationEmail({
    to: email, userId: typeof p.buyer_id === 'string' ? p.buyer_id : null, category: 'engagement', onceKey: `checkout:${orderId}`,
    subject: 'You left something in your cart',
    heading: 'Your order is saved',
    bodyText: 'You started a checkout on the CodeSpectra marketplace but didn’t finish. Pick up where you left off — it only takes a minute.',
    cta: { label: 'Resume checkout', url },
    reason: 'You got this email because you started a checkout on CodeSpectra.',
  })
}

// ─── AU-12 re-engagement + streak saver ─────────────────────────────────────

export async function runReengagement(now = new Date()): Promise<{ emailed: number }> {
  const db = await getMongoDb()
  let emailed = 0
  for (const days of INACTIVE_STEPS) {
    const from = new Date(now.getTime() - (days + 1) * 86_400_000)
    const to = new Date(now.getTime() - days * 86_400_000)
    const users = (await db.collection('user').find({ lastLoginAt: { $gte: from, $lt: to }, isActive: { $ne: false }, deleted_at: { $exists: false }, email: { $type: 'string' } }, { projection: { id: 1, _id: 1, email: 1, name: 1, fullName: 1, lastLoginAt: 1, tenantId: 1 } }).limit(2000).toArray()) as Doc[]
    for (const u of users) {
      const uid = String(u.id || u._id)
      const bucket = inactivityBucket(u.lastLoginAt as Date, now)
      if (bucket !== days) continue
      const last = (u.lastLoginAt as Date).toISOString()
      if (!(await claimOnce(`inactive:${uid}:${days}:${last.slice(0, 10)}`))) continue
      void emit('user.inactive', { user_id: uid, email: u.email, name: u.fullName || u.name || null, days, last_login_at: last }, { tenantId: (u.tenantId as string) ?? null, idempotencyKey: `user.inactive:${uid}:${days}:${last.slice(0, 10)}` })
      const out = await sendAutomationEmail({
        to: String(u.email), userId: uid, category: 'engagement',
        subject: days >= 30 ? 'We saved your progress — come back anytime' : 'Today’s coding challenge is waiting',
        heading: days >= 30 ? `It’s been a while, ${nameOf(u)}` : `Ready for a quick one, ${nameOf(u)}?`,
        bodyText: days >= 30
          ? 'Your problems, certificates and progress are still here. New practice problems and events were added while you were away.'
          : 'A ten-minute problem is the easiest way to keep your skills sharp. Today’s challenge is ready.',
        cta: { label: 'Solve today’s challenge', url: '/dashboard/arena' },
        reason: 'You got this email because you have a CodeSpectra account and haven’t signed in for a while.',
      })
      if (out === 'sent' || out === 'deferred' || out === 'queued') emailed++
    }
  }
  return { emailed }
}

export async function runStreakSaver(now = new Date()): Promise<{ nudged: number }> {
  const utcHour = now.getUTCHours()
  if (utcHour >= 23) return { nudged: 0 } // too late to save today's UTC streak
  const db = await getMongoDb()
  const today = now.toISOString().slice(0, 10)
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10)
  const rows = (await db.collection('submissions').aggregate([
    // created_at is an ISO string on new rows and a Date on some older ones.
    { $match: { status: 'accepted', $or: [{ created_at: { $gte: `${yesterday}T00:00:00.000Z` } }, { created_at: { $gte: new Date(`${yesterday}T00:00:00.000Z`) } }] } },
    { $project: { user_id: 1, day: { $substrBytes: [{ $toString: '$created_at' }, 0, 10] } } },
    { $group: { _id: '$user_id', days: { $addToSet: '$day' } } },
    { $limit: 20000 },
  ]).toArray()) as { _id: string; days: string[] }[]
  const atRisk = rows.filter((r) => r._id && r.days.includes(yesterday) && !r.days.includes(today)).map((r) => String(r._id))
  if (!atRisk.length) return { nudged: 0 }
  const tzRows = (await db.collection('notification_preferences').find({ user_id: { $in: atRisk }, type: 'quiet_hours' }, { projection: { user_id: 1, timeZone: 1 } }).toArray()) as Doc[]
  const tz = new Map(tzRows.map((r) => [String(r.user_id), typeof r.timeZone === 'string' ? r.timeZone : 'UTC']))
  const { notify } = await import('@/lib/notifications')
  let nudged = 0
  for (const uid of atRisk) {
    const lh = localHour(now, tz.get(uid) || 'UTC')
    if (!(lh >= 20 || utcHour >= 21)) continue
    if (!(await claimOnce(`streak:${uid}:${today}`))) continue
    await notify({ user_id: uid, type: 'streak.saver', title: 'Keep your streak alive', message: 'Solve one problem before midnight UTC to keep your streak going.', link: '/dashboard/arena', icon: 'flame' })
    nudged++
  }
  return { nudged }
}

// ─── AU-16 certificates ─────────────────────────────────────────────────────

async function certificateFollowUp(p: Doc): Promise<unknown> {
  const u = await loadUser(String(p.user_id))
  if (!u?.email) return { skipped: true }
  const origin = getAppOrigin()
  const verify = String(p.verify_url || '')
  const verifyUrl = verify.startsWith('/') ? `${origin}${verify}` : verify
  const title = String(p.title || 'your certificate')
  const linkedin = linkedInAddUrl({ title, verifyUrl, issuedAt: String(p.issued_at || new Date().toISOString()), certId: verify.split('/').pop() || undefined })
  return sendAutomationEmail({
    to: String(u.email), userId: String(u.id || u._id), category: 'engagement', onceKey: `cert-follow:${verify || title}`,
    subject: `Add your “${title}” certificate to LinkedIn`,
    heading: 'Show off your certificate',
    bodyText: `Congratulations again, ${nameOf(u)}! Recruiters can check your “${title}” certificate in one click. Add it to your LinkedIn profile — the details are filled in for you.`,
    cta: { label: 'Add to LinkedIn', url: linkedin },
    reason: 'You got this email because you earned a certificate on CodeSpectra.',
  })
}

export async function runCertificateExpiry(now = new Date()): Promise<{ reminded: number }> {
  const db = await getMongoDb()
  const rows = (await db.collection('certification_attempts').find({
    passed: true, revoked_at: { $in: [null, undefined] },
    expires_at: { $gt: now.toISOString(), $lte: new Date(now.getTime() + 30 * 86_400_000).toISOString() },
  } as never, { projection: { id: 1, user_id: 1, expires_at: 1, cert_snapshot: 1 } }).limit(2000).toArray()) as Doc[]
  const { notify } = await import('@/lib/notifications')
  let reminded = 0
  for (const c of rows) {
    if (!(await claimOnce(`cert-exp:${String(c.id)}:${String(c.expires_at)}`))) continue
    const title = String((c.cert_snapshot as Doc | undefined)?.title || 'Your certificate')
    await notify({ user_id: String(c.user_id), type: 'certification.expiring', title: `${title} expires soon`, message: `It expires on ${new Date(String(c.expires_at)).toUTCString().slice(0, 16)}. Retake it to keep it current.`, link: '/dashboard/certifications', icon: 'clock' })
    reminded++
  }
  return { reminded }
}

export const ENGAGEMENT_AUTOMATIONS: SystemAutomation[] = [
  {
    id: 'onboarding',
    title: 'Sign-up follow-up',
    description: 'A day after sign-up, reminds people who haven’t confirmed their email; after three quiet days, sends three first steps (first problem, mock test, events).',
    group: 'Engagement',
    refs: ['AU-10'],
    events: [{
      type: 'user.created',
      handle: async (ev) => {
        const uid = String(ev.payload.user_id || '')
        if (!uid) return
        const t = Date.parse(String(ev.payload.created_at || ev.created_at)) || Date.now()
        if (ev.payload.email_verified !== true) await scheduleJob('onboarding_verify', `onboard-verify:${uid}`, new Date(t + 24 * 3_600_000), { user_id: uid })
        await scheduleJob('onboarding_tips', `onboard-tips:${uid}`, new Date(t + 3 * 86_400_000), { user_id: uid })
      },
    }],
    jobs: [
      { type: 'onboarding_verify', handler: onboardingVerify },
      { type: 'onboarding_tips', handler: onboardingTips },
    ],
  },
  {
    id: 'abandoned-checkout',
    title: 'Abandoned marketplace checkout',
    description: 'An hour after a marketplace checkout starts, emails the buyer a resume link if the order still isn’t paid. Works from the marketplace’s checkout and payment events.',
    group: 'Engagement',
    refs: ['AU-11'],
    events: [
      { type: 'marketplace.checkout.created', handle: async (ev) => { if (ev.payload.order_id) await scheduleJob('abandoned_checkout', `checkout:${String(ev.payload.order_id)}`, new Date(Date.now() + 3_600_000), ev.payload, { tenantId: ev.tenant_id }) } },
      { type: 'marketplace.order.paid', handle: async (ev) => { if (ev.payload.order_id) await cancelJobs({ type: 'abandoned_checkout', keyPrefix: `checkout:${String(ev.payload.order_id)}` }) } },
    ],
    jobs: [{ type: 'abandoned_checkout', handler: abandonedCheckout }],
  },
  {
    id: 're-engagement',
    title: 'Re-engagement emails',
    description: 'Daily: invites people back after 7, 14 and 30 days without signing in (once each), and emits user.inactive for workflows.',
    group: 'Engagement',
    refs: ['AU-12'],
    cadence: { kind: 'daily', hourUtc: 4 },
    run: async (now) => runReengagement(now),
  },
  {
    id: 'streak-saver',
    title: 'Streak saver',
    description: 'In the evening (their time), nudges people who practised yesterday but not yet today, before their streak resets at midnight UTC.',
    group: 'Engagement',
    refs: ['AU-12'],
    cadence: { kind: 'interval', minutes: 60 },
    run: async (now) => runStreakSaver(now),
  },
  {
    id: 'certificate-follow-up',
    title: 'Certificate follow-ups',
    description: 'A couple of hours after a certificate is issued, emails an “add to LinkedIn” link with the details filled in; reminds holders 30 days before a certificate with an expiry date runs out.',
    group: 'Engagement',
    refs: ['AU-16'],
    cadence: { kind: 'daily', hourUtc: 6 },
    run: async (now) => runCertificateExpiry(now),
    events: [{ type: 'certificate.issued', handle: async (ev) => { if (ev.payload.user_id) await scheduleJob('cert_follow_up', `cert-follow:${String(ev.payload.verify_url || ev.id)}`, new Date(Date.now() + 2 * 3_600_000), ev.payload, { tenantId: ev.tenant_id }) } }],
    jobs: [{ type: 'cert_follow_up', handler: certificateFollowUp }],
  },
]
