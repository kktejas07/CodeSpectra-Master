/**
 * Wave 15 billing nudges (default OFF — they message people / can issue coupons):
 *   checkout-recovery   unpaid plan orders: resume link at 1 h, optional one-time coupon at 24 h
 *   renewal-nudges      org licences 30 / 7 days before the end (with seat usage)
 * and, always on (locked — AUTO-111):
 *   auto-renew-notice   heads-up 3 days before an automatic renewal charge (amount + manage link)
 * Money is integer minor units; payment itself only through the normal checkout.
 */
import { getMongoDb } from '@/lib/mongodb'
import { tenantAdminUsers } from '../mailer'
import { deliverNudge, tally, type NudgeOutcome } from '../nudges/deliver'
import { nudgeMail, nudgeNote, dayUtc, money } from '../nudges/text'
import { autoRenews, AUTO_RENEW_NOTICE_DAYS, checkoutRecoveryStep, dueLadderStep, LICENCE_RENEWAL_DAYS, RECOVERY_COUPON_COOLDOWN_DAYS, recoveryCouponAllowed, recoveryCouponCode, stepKey } from '../nudges/rules'
import { getNudgeSettings } from '../nudges/settings'
import { budgetHasRoom } from '@/lib/messaging/budget'
import { utcDay } from '@/lib/messaging/budget-rules'
import type { SystemAutomation } from './types'

type Doc = Record<string, any>
const DAY = 86_400_000
const firstName = (s: unknown) => (typeof s === 'string' && s.trim() ? s.trim().split(/\s+/)[0].slice(0, 40) : null)

async function paidSince(userId: string, since: string): Promise<boolean> {
  const db = await getMongoDb()
  return !!(await db.collection('billing_orders').findOne({ user_id: userId, status: 'paid', created_at: { $gte: since } }, { projection: { _id: 1 } }))
}

let couponIndex: Promise<unknown> | null = null

/** Newest live (delivered) recovery coupon of this person within the cooldown window. */
async function lastRecoveryCouponAt(userId: string, now: Date): Promise<string | null> {
  const { billingCoupons } = await import('@/lib/db/billing')
  const col = await billingCoupons()
  if (!couponIndex) couponIndex = col.createIndex({ created_by: 1, user_id: 1, created_at: -1 }, { name: 'personal_coupons', partialFilterExpression: { user_id: { $type: 'string' } } }).catch(() => { couponIndex = null })
  await couponIndex
  const since = new Date(now.getTime() - RECOVERY_COUPON_COOLDOWN_DAYS * DAY).toISOString()
  const c = await col.findOne(
    { created_by: 'system:checkout-recovery', user_id: userId, active: { $ne: false }, created_at: { $gte: since } },
    { projection: { _id: 0, created_at: 1 }, sort: { created_at: -1 } },
  )
  return c?.created_at ?? null
}

export async function runCheckoutRecovery(now = new Date()): Promise<Record<string, number>> {
  const db = await getMongoDb()
  const settings = await getNudgeSettings()
  const orders = (await db.collection('billing_orders').find({
    status: { $in: ['created', 'attempted'] },
    plan_kind: { $ne: 'licence' },
    created_at: { $gte: new Date(now.getTime() - 3 * DAY).toISOString(), $lte: new Date(now.getTime() - 3_600_000).toISOString() },
  }, { projection: { _id: 0, id: 1, user_id: 1, plan_id: 1, plan_name: 1, interval: 1, currency: 1, status: 1, created_at: 1, plan_kind: 1, recovery_steps: 1 } }).sort({ created_at: -1 }).limit(1000).toArray()) as Doc[]
  const seen = new Set<string>()
  const outcomes: NudgeOutcome[] = []
  let coupons = 0
  for (const o of orders) {
    // One recovery per person and plan (the newest unpaid order wins).
    const k = `${String(o.user_id)}:${String(o.plan_id)}`
    if (seen.has(k)) continue
    seen.add(k)
    const step = checkoutRecoveryStep(o, now, (o.recovery_steps as string[]) || [], await paidSince(String(o.user_id), String(o.created_at)))
    if (!step) continue
    const u = (await db.collection('user').findOne({ id: o.user_id }, { projection: { email: 1, name: 1, fullName: 1 } })) as Doc | null
    if (!u?.email) continue
    const plan = String(o.plan_name || o.plan_id || 'your plan').slice(0, 80)
    const q = new URLSearchParams({ plan: String(o.plan_id || ''), ...(o.interval ? { interval: String(o.interval) } : {}), ...(o.currency ? { currency: String(o.currency).toUpperCase() } : {}) })
    let coupon: { id: string; code: string } | null = null
    // At their cap: don't mint a coupon that would only be switched off again (AUTO-101).
    if (step === '24h' && settings.checkout_coupon_pct > 0 && !(await budgetHasRoom({ userId: String(o.user_id), email: String(u.email) }, 'engagement', now))) {
      outcomes.push('capped')
      continue
    }
    // SEC-035: one recovery coupon per person per 90 days, redeemable only by them.
    if (step === '24h' && settings.checkout_coupon_pct > 0 && recoveryCouponAllowed(await lastRecoveryCouponAt(String(o.user_id), now), now)) {
      const { createCoupon } = await import('@/lib/billing/coupon-admin')
      const r = await createCoupon('system:checkout-recovery', {
        code: recoveryCouponCode(), discount_type: 'percentage', discount_value: settings.checkout_coupon_pct, max_uses: 1,
        valid_until: new Date(now.getTime() + 3 * DAY).toISOString(), applies_to: 'plans', plan_ids: [String(o.plan_id)], per_user_limit: 1,
      }, { userId: String(o.user_id) }).catch(() => null)
      if (r?.ok) { coupon = { id: r.coupon.id, code: r.coupon.code }; q.set('coupon', coupon.code) }
    }
    const params = { plan, pct: settings.checkout_coupon_pct, code: coupon?.code || '', date: dayUtc(new Date(now.getTime() + 3 * DAY).toISOString()) }
    const id = step === '1h' ? 'checkout' : coupon ? 'checkoutCoupon' : 'checkoutLate'
    const out = await deliverNudge({
      automationId: 'checkout-recovery', key: `${String(o.id)}:${step}`, now, to: { userId: String(o.user_id), email: String(u.email) },
      email: nudgeMail({ id, category: 'engagement', params, name: firstName(u.fullName || u.name), cta: { url: `/dashboard/checkout?${q.toString()}` } }),
      stillDue: async () => !(await paidSince(String(o.user_id), String(o.created_at))),
    })
    outcomes.push(out)
    if (out === 'sent') {
      await db.collection('billing_orders').updateOne({ id: o.id }, { $addToSet: { recovery_steps: step } })
      if (coupon) coupons++
    } else if (coupon) {
      // Nothing went out: switch the unused code off.
      const { billingCoupons } = await import('@/lib/db/billing')
      await (await billingCoupons()).updateOne({ id: coupon.id }, { $set: { active: false } }).catch(() => {})
    }
  }
  return { ...tally(outcomes), coupons }
}

export async function runRenewalNudges(now = new Date()): Promise<Record<string, number>> {
  const db = await getMongoDb()
  const outcomes: NudgeOutcome[] = []
  // Organisation licences: 30 and 7 days before the end.
  const { licencesCol, seatUsage } = await import('@/lib/billing/licences')
  const { licences } = await licencesCol()
  const lics = (await licences.find({ status: 'active', ends_at: { $gt: now.toISOString(), $lte: new Date(now.getTime() + 30 * DAY).toISOString() } }, { projection: { _id: 0 } }).limit(1000).toArray()) as unknown as Doc[]
  for (const l of lics) {
    const step = dueLadderStep(l.ends_at, now, LICENCE_RENEWAL_DAYS.map((d) => d * 24), (l.renewal_steps as string[]) || [])
    if (!step) continue
    const usage = await seatUsage(String(l.id)).catch(() => ({ assigned: Number(l.seats_used) || 0 }))
    const days = Math.max(1, Math.ceil((Date.parse(l.ends_at) - now.getTime()) / DAY))
    const params = { org: String(l.org_name || 'Your organisation').slice(0, 80), plan: String(l.plan_key || ''), date: dayUtc(l.ends_at), days, used: usage.assigned, seats: Number(l.seats) || 0 }
    const admins = await tenantAdminUsers(String(l.org_id))
    const creator = l.created_by && !admins.some((a) => a.id === l.created_by) ? (await db.collection('user').findOne({ id: l.created_by, $or: [{ tenantId: l.org_id }, { tenant_id: l.org_id }, { organizationId: l.org_id }] }, { projection: { id: 1, email: 1, name: 1, fullName: 1 } })) as Doc | null : null
    const people = [...admins, ...(creator?.email ? [{ id: String(creator.id), email: String(creator.email), name: String(creator.fullName || creator.name || '') }] : [])]
    let any = false
    for (const p of people) {
      const o = await deliverNudge({
        automationId: 'renewal-nudges', key: `licence:${String(l.id)}:${String(l.ends_at)}:${stepKey(step)}:${p.id}`, now, capExempt: true, tenantId: String(l.org_id),
        class: 'payment', topic: 'licence-renewal', object: `${String(l.id)}:${String(l.ends_at).slice(0, 10)}:${utcDay(now)}`,
        to: { userId: p.id, email: p.email },
        email: nudgeMail({ id: 'licenceRenewal', category: 'billing', params, name: firstName(p.name), cta: { url: '/dashboard/admin/licences' }, dedupe: { kind: 'licence-renewal', ref: `${String(l.id)}:${String(l.ends_at)}:${stepKey(step)}` } }),
        inApp: { type: 'billing.licence_expiring', ...nudgeNote('licence', { title: 'title', message: 'message' }, params), link: '/dashboard/admin/licences', icon: 'key-round', skip_push: true },
        stillDue: async () => !!(await licences.findOne({ id: l.id, status: 'active', ends_at: l.ends_at }, { projection: { _id: 1 } })),
      })
      outcomes.push(o)
      if (o === 'sent') any = true
    }
    if (any) await licences.updateOne({ id: l.id }, { $addToSet: { renewal_steps: stepKey(step) } } as never)
  }
  return tally(outcomes)
}

/**
 * Automatic renewals: a heads-up with the amount 3 days before the charge
 * (pre-debit notice, legally required for e-mandates; class 'legal', never
 * capped, once per charge). Its own always-on automation (AUTO-111), so an
 * auto-renew customer gets it on a fresh install whatever the off-by-default
 * renewal nudges are set to.
 */
export async function runAutoRenewNotices(now = new Date()): Promise<Record<string, number>> {
  const db = await getMongoDb()
  const outcomes: NudgeOutcome[] = []
  const subs = (await db.collection('billing_subscriptions').find({ status: 'active', ends_at: { $gt: now.toISOString(), $lte: new Date(now.getTime() + AUTO_RENEW_NOTICE_DAYS * DAY).toISOString() } }, { projection: { _id: 0 } }).limit(5000).toArray()) as Doc[]
  const { stripeAutoRenewEnabled } = await import('@/lib/stripe-client')
  const stripeRenews = stripeAutoRenewEnabled()
  for (const s of subs) {
    if (!autoRenews(s, stripeRenews) || !dueLadderStep(s.ends_at, now, [AUTO_RENEW_NOTICE_DAYS * 24], [])) continue
    const u = (await db.collection('user').findOne({ id: s.user_id }, { projection: { email: 1, name: 1, fullName: 1 } })) as Doc | null
    if (!u?.email) continue
    const last = (await db.collection('billing_orders').find({ user_id: s.user_id, status: 'paid', $or: [{ subscription_id: s.id }, { plan_id: s.plan_id }] }, { projection: { _id: 0, amount_paise: 1, currency: 1, plan_name: 1 } }).sort({ created_at: -1 }).limit(1).toArray())[0] as Doc | undefined
    const params = { plan: String(last?.plan_name || s.plan_id || 'Your plan').slice(0, 80), date: dayUtc(s.ends_at), amount: last ? money(Number(last.amount_paise) || 0, String(last.currency || 'INR')) : '—' }
    outcomes.push(await deliverNudge({
      // Pre-debit notice (legally required for e-mandates): never capped, once per charge
      // (the topic/object claim also covers notices sent under the old renewal-nudges id).
      automationId: 'auto-renew-notice', key: `autorenew:${String(s.id)}:${String(s.ends_at)}`, now, capExempt: true,
      class: 'legal', topic: 'auto-renew-notice', object: `${String(s.id)}:${String(s.ends_at).slice(0, 10)}`,
      to: { userId: String(s.user_id), email: String(u.email) },
      email: nudgeMail({ id: 'autoRenew', category: 'billing', params, name: firstName(u.fullName || u.name), cta: { url: '/dashboard/billing' } }),
      stillDue: async () => {
        const cur = (await db.collection('billing_subscriptions').findOne({ id: s.id }, { projection: { _id: 0, status: 1, billing_mode: 1, cancel_at_period_end: 1, past_due: 1, ends_at: 1 } })) as Doc | null
        return !!cur && cur.ends_at === s.ends_at && autoRenews(cur, stripeRenews)
      },
    }))
  }
  return tally(outcomes)
}

export const BILLING_NUDGE_AUTOMATIONS: SystemAutomation[] = [
  {
    id: 'checkout-recovery',
    title: 'Abandoned plan checkout recovery',
    description: 'An hour after a plan checkout is left unpaid, emails a resume link; at 24 hours sends a one-time coupon if one is set under Nudge limits (off by default). Stops as soon as they pay.',
    group: 'Billing',
    refs: ['W15-AUTO-03'],
    defaultOn: false,
    cadence: { kind: 'interval', minutes: 30 },
    run: async (now) => runCheckoutRecovery(now),
  },
  {
    id: 'renewal-nudges',
    title: 'Licence renewal notices',
    description: 'Organisation admins get a licence renewal email with seat usage 30 and 7 days before it ends.',
    group: 'Billing',
    refs: ['W15-AUTO-04'],
    defaultOn: false,
    cadence: { kind: 'daily', hourUtc: 4, minuteUtc: 30 },
    run: async (now) => runRenewalNudges(now),
  },
  {
    id: 'auto-renew-notice',
    title: 'Pre-charge notice for automatic renewals',
    description: 'People on an automatically renewing plan (card or UPI mandate) get the amount and a manage/cancel link 3 days before the charge. Always on: it is a required payment notice, sent once per charge and never held by the message limit.',
    group: 'Billing',
    refs: ['W15-AUTO-04', 'AUTO-093', 'AUTO-111'],
    locked: true,
    cadence: { kind: 'daily', hourUtc: 4, minuteUtc: 30 },
    run: async (now) => runAutoRenewNotices(now),
  },
]
