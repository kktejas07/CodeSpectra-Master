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
import { claimOnce, releaseClaim } from '../store'
import { inactivityBucket, INACTIVE_STEPS, linkedInAddUrl, localHour } from './rules'
import type { SystemAutomation } from './types'

type Doc = Record<string, unknown>

async function loadUser(userId: string): Promise<Doc | null> {
  const db = await getMongoDb()
  return (await db.collection('user').findOne({ $or: [{ id: userId }, { _id: userId as never }] }, { projection: { id: 1, _id: 1, email: 1, name: 1, fullName: 1, emailVerified: 1, isActive: 1, deleted_at: 1 } })) as Doc | null
}
const nameOf = (u: Doc) => String(u.fullName || u.name || 'there').split(' ')[0]
/** Greeting line for localized mails (no English "there" when the name is unknown). */
const hiPart = (u: Doc) => (u.fullName || u.name ? { key: 'auto.hi', params: { name: nameOf(u) } } : { key: 'auto.hiNoName' })

// ─── AU-10 onboarding ───────────────────────────────────────────────────────

async function onboardingVerify(p: Doc): Promise<unknown> {
  const u = await loadUser(String(p.user_id))
  if (!u?.email || u.emailVerified === true || u.isActive === false || u.deleted_at) return { skipped: true }
  return sendAutomationEmail({
    to: String(u.email), userId: String(u.id || u._id), category: 'engagement', onceKey: `onboard-verify:${String(u.id || u._id)}`,
    dedupe: { kind: 'onboard-verify', ref: String(u.id || u._id) },
    subject: 'One step left: confirm your email',
    heading: 'Confirm your email to get started',
    bodyText: `Hi ${nameOf(u)},\n\nYou’re nearly set up. Sign in and press “Resend verification” on your dashboard to get a fresh link — it unlocks tests, events and certificates.`,
    cta: { label: 'Sign in', url: '/login' },
    reason: 'You got this email because you created a CodeSpectra account.',
    i18n: { subject: { key: 'auto.verify.subject' }, heading: { key: 'auto.verify.heading' }, body: [hiPart(u), { key: 'auto.verify.body' }], cta: { key: 'auto.signIn' }, reason: { key: 'auto.verify.reason' } },
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
    i18n: { subject: { key: 'auto.tips.subject' }, heading: { key: 'auto.tips.heading', params: { name: nameOf(u) } }, body: { key: 'auto.tips.body' }, cta: { key: 'auto.tips.cta' }, reason: { key: 'auto.tips.reason' } },
  })
}

// ─── AU-11 abandoned marketplace checkout ───────────────────────────────────

/**
 * Pure (AUTO-033): should an "abandoned cart" email go out for this order?
 * Only when the checkout is still unpaid or ran out of time — never after the
 * buyer cancelled, restarted checkout (order replaced), paid, or the gateway
 * declined (that already sends its own "payment did not go through" email) —
 * and never when the buyer paid a newer order since.
 */
export function abandonedCartDecision(order: { status?: string; cancelled_reason?: string | null } | null, hasLaterPaidOrder: boolean): 'send' | 'skip' {
  if (!order || hasLaterPaidOrder) return 'skip'
  if (order.status === 'pending_payment') return 'send'
  if (order.status === 'cancelled' && order.cancelled_reason === 'expired') return 'send'
  return 'skip'
}

async function abandonedCheckout(p: Doc): Promise<unknown> {
  const db = await getMongoDb()
  const orderId = String(p.order_id || '')
  if (!orderId) return { skipped: true }
  const order = (await db.collection('mkt_orders').findOne({ id: orderId }, { projection: { _id: 0, id: 1, status: 1, cancelled_reason: 1, buyer_id: 1, created_at: 1 } })) as Doc | null
  const buyer = String(order?.buyer_id || p.buyer_id || '')
  const later = order && buyer
    ? await db.collection('mkt_orders').countDocuments({ buyer_id: buyer, id: { $ne: orderId }, created_at: { $gt: String(order.created_at || '') }, status: { $nin: ['pending_payment', 'cancelled'] } }, { limit: 1 })
    : 0
  if (abandonedCartDecision(order as never, later > 0) === 'skip') return { skipped: order ? `order ${String(order.status)}${order.cancelled_reason ? ` (${String(order.cancelled_reason)})` : ''}` : 'order not found' }
  const email = typeof p.buyer_email === 'string' ? p.buyer_email : ''
  if (!email) return { skipped: 'no email' }
  const raw = String(p.resume_url || '')
  // Only links back into this site.
  const origin = getAppOrigin()
  const url = raw.startsWith('/') && !raw.startsWith('//') ? raw : raw.startsWith(origin + '/') ? raw : '/marketplace'
  return sendAutomationEmail({
    to: email, userId: typeof p.buyer_id === 'string' ? p.buyer_id : null, category: 'engagement', onceKey: `checkout:${orderId}`,
    dedupe: { kind: 'checkout', ref: orderId },
    subject: 'Your cart is waiting',
    heading: 'Your cart is waiting',
    bodyText: 'You started a checkout on the CodeSpectra marketplace but didn’t finish. Items aren’t held for long — pick up where you left off while they’re still available.',
    cta: { label: 'Back to checkout', url },
    reason: 'You got this email because you started a checkout on CodeSpectra.',
    i18n: { subject: { key: 'auto.cart.subject' }, heading: { key: 'auto.cart.subject' }, body: { key: 'auto.cart.body' }, cta: { key: 'auto.cart.cta' }, reason: { key: 'auto.cart.reason' } },
  })
}

// ─── AU-12 re-engagement + streak saver ─────────────────────────────────────

/** People who reached 7 / 14 / 30 days without a sign-in today (shared with the signals sweep). */
export async function inactiveUsers(now = new Date()): Promise<{ user: Doc; uid: string; days: number; last: string }[]> {
  const db = await getMongoDb()
  const out: { user: Doc; uid: string; days: number; last: string }[] = []
  for (const days of INACTIVE_STEPS) {
    const from = new Date(now.getTime() - (days + 1) * 86_400_000)
    const to = new Date(now.getTime() - days * 86_400_000)
    const users = (await db.collection('user').find({ lastLoginAt: { $gte: from, $lt: to }, isActive: { $ne: false }, deleted_at: { $exists: false }, email: { $type: 'string' } }, { projection: { id: 1, _id: 1, email: 1, name: 1, fullName: 1, lastLoginAt: 1, tenantId: 1, organizationId: 1 } }).limit(2000).toArray()) as Doc[]
    for (const u of users) {
      const lastLogin = u.lastLoginAt instanceof Date ? u.lastLoginAt : new Date(String(u.lastLoginAt))
      if (inactivityBucket(lastLogin, now) !== days) continue
      out.push({ user: u, uid: String(u.id || u._id), days, last: lastLogin.toISOString() })
    }
  }
  return out
}

/** user.inactive for workflows (always on, see ./signals.ts — AUTO-003). */
export async function emitInactivitySignals(now = new Date()): Promise<number> {
  let n = 0
  for (const { user: u, uid, days, last } of await inactiveUsers(now)) {
    const tenantId = typeof u.tenantId === 'string' ? u.tenantId : typeof u.organizationId === 'string' ? u.organizationId : null
    const r = await emit('user.inactive', { user_id: uid, email: u.email, name: u.fullName || u.name || null, days, last_login_at: last }, { tenantId, idempotencyKey: `user.inactive:${uid}:${days}:${last.slice(0, 10)}` })
    if (r.id) n++
  }
  return n
}

/**
 * W15-AUTO-02: the come-back email names one thing from the learner's study plan
 * (their weakest area's next item) and their best streak; at 30 days it offers to
 * rebuild the plan. People without a plan get the generic note. Goes through the
 * shared nudge sender (once, shared frequency cap, unsubscribe, run log).
 */
export async function runReengagement(now = new Date()): Promise<Record<string, number>> {
  const [{ deliverNudge, tally }, { nudgeMail }, { pickForLearner }, { plansCol }, { getUserStreak }] = await Promise.all([
    import('../nudges/deliver'), import('../nudges/text'), import('../nudges/rules'), import('@/lib/study-plan/db'), import('@/lib/activity-streak'),
  ])
  const plans = await plansCol()
  const outcomes: Awaited<ReturnType<typeof deliverNudge>>[] = []
  let personalised = 0
  for (const { user: u, uid, days, last } of await inactiveUsers(now)) {
    const plan = (await plans.findOne({ user_id: uid, status: 'active' }, { projection: { _id: 0, status: 1, weak_areas: 1, week: 1 } }).catch(() => null)) as never
    const pick = days < 30 ? pickForLearner(plan) : null
    const best = (await getUserStreak(uid).catch(() => null))?.longest ?? 0
    const streak = best >= 2 ? [{ key: 'auto.nudge.comeBack.streak', params: { days: best } }] : []
    const dedupe = { kind: 're-engagement' as const, ref: `${uid}:${days}:${last}` }
    const name = u.fullName || u.name ? nameOf(u) : null
    const email = pick
      ? nudgeMail({ id: 'comeBack', category: 'engagement', params: { title: pick.title.slice(0, 120), area: pick.area || '' }, name, bodyKey: pick.area ? 'auto.nudge.comeBack.body' : 'auto.nudge.comeBack.bodyNoArea', extra: streak, cta: { url: pick.href }, dedupe })
      : days >= 30 && plan
        ? nudgeMail({ id: 'comeBackRebuild', category: 'engagement', name, extra: streak, cta: { url: '/dashboard/study-plan' }, dedupe })
        : {
            category: 'engagement' as const, dedupe,
            subject: days >= 30 ? 'We saved your progress — come back anytime' : 'Today’s coding challenge is waiting',
            heading: days >= 30 ? `It’s been a while, ${nameOf(u)}` : `Ready for a quick one, ${nameOf(u)}?`,
            bodyText: days >= 30
              ? 'Your problems, certificates and progress are still here. New practice problems and events were added while you were away.'
              : 'A ten-minute problem is the easiest way to keep your skills sharp. Today’s challenge is ready.',
            cta: { label: 'Solve today’s challenge', url: '/dashboard/arena' },
            reason: 'You got this email because you have a CodeSpectra account and haven’t signed in for a while.',
            i18n: days >= 30
              ? { subject: { key: 'auto.back.subjectLong' }, heading: { key: 'auto.back.headingLong', params: { name: nameOf(u) } }, body: { key: 'auto.back.bodyLong' }, cta: { key: 'auto.back.cta' }, reason: { key: 'auto.back.reason' } }
              : { subject: { key: 'auto.back.subject' }, heading: { key: 'auto.back.heading', params: { name: nameOf(u) } }, body: { key: 'auto.back.body' }, cta: { key: 'auto.back.cta' }, reason: { key: 'auto.back.reason' } },
          }
    const o = await deliverNudge({ automationId: 're-engagement', key: `${uid}:${days}:${last.slice(0, 10)}`, now, to: { userId: uid, email: String(u.email) }, email })
    outcomes.push(o)
    if (o === 'sent' && pick) personalised++
  }
  const t = tally(outcomes)
  return { emailed: t.sent, personalised, capped: t.capped, skipped: t.skipped }
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
    // Engagement nudge: counts toward the shared per-person cap (AUTO-094); notify returns null when held.
    const n = await notify({ user_id: uid, type: 'streak.saver', budget: { class: 'engagement', topic: 'streak-saver', object: today, source: 'streak-saver' }, title: 'Keep your streak alive', message: 'Solve one problem before midnight UTC to keep your streak going.', title_i18n: { key: 'streak.title' }, message_i18n: { key: 'streak.message' }, link: '/dashboard/arena', icon: 'flame' })
    if (n) nudged++
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
    dedupe: { kind: 'cert-follow', ref: verify || title },
    subject: `Add your “${title}” certificate to LinkedIn`,
    heading: 'Show off your certificate',
    bodyText: `Congratulations again, ${nameOf(u)}! Recruiters can check your “${title}” certificate in one click. Add it to your LinkedIn profile — the details are filled in for you.`,
    cta: { label: 'Add to LinkedIn', url: linkedin },
    reason: 'You got this email because you earned a certificate on CodeSpectra.',
    i18n: { subject: { key: 'auto.cert.subject', params: { title } }, heading: { key: 'auto.cert.heading' }, body: { key: 'auto.cert.body', params: { name: nameOf(u), title } }, cta: { key: 'auto.cert.cta' }, reason: { key: 'auto.cert.reason' } },
  })
}

export async function runCertificateExpiry(now = new Date()): Promise<{ reminded: number }> {
  const db = await getMongoDb()
  const rows = (await db.collection('certification_attempts').find({
    passed: true, revoked_at: { $in: [null, undefined] },
    // Renewed (superseded) rows are not expiring; proctored pro-certs (issue_key pcert:…) have
    // their own 60 / 14 / 1-day ladder in cert-renewal (AUTO-095).
    superseded_by: { $in: [null, undefined] },
    issue_key: { $not: /^pcert:/ },
    expires_at: { $gt: now.toISOString(), $lte: new Date(now.getTime() + 30 * 86_400_000).toISOString() },
  } as never, { projection: { id: 1, user_id: 1, expires_at: 1, cert_snapshot: 1 } }).limit(2000).toArray()) as Doc[]
  const { notify } = await import('@/lib/notifications')
  let reminded = 0
  for (const c of rows) {
    const expKey = `cert-exp:${String(c.id)}:${String(c.expires_at)}`
    if (!(await claimOnce(expKey))) continue
    const title = String((c.cert_snapshot as Doc | undefined)?.title || 'Your certificate')
    // Deadline reminder through the shared budget (certification.expiring is a capped type).
    const n = await notify({ budget: { class: 'deadline', topic: 'cert-expiry', object: `${String(c.id)}:${String(c.expires_at).slice(0, 10)}`, source: 'certificate-follow-up' }, user_id: String(c.user_id), type: 'certification.expiring', title: `${title} expires soon`, message: `It expires on ${new Date(String(c.expires_at)).toUTCString().slice(0, 16)}. Retake it to keep it current.`, title_i18n: { key: 'certExpiring.title', params: { title } }, message_i18n: { key: 'certExpiring.message', params: { date: new Date(String(c.expires_at)).toUTCString().slice(0, 16) } }, link: '/dashboard/certifications', icon: 'clock' })
    if (n) reminded++
    else await releaseClaim(expKey) // held by the cap (or failed): try again tomorrow
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
    description: 'Daily: invites people back after 7, 14 and 30 days without signing in (once each) with one pick from their study plan’s weakest area and their best streak; at 30 days offers to rebuild the plan. Counts toward the shared nudge cap. The user.inactive event for workflows comes from “Event signals”, so it keeps flowing when this is off.',
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
