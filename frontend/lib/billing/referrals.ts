/**
 * Paid-referral rewards (server). Rules in ./referral-reward.ts.
 * Collection `billing_referral_rewards` (one row per referee, unique):
 *   { id, referrer_id, referee_id, order_id, currency, due_at, status: pending|granted|void, reason?, created_at }
 */
import 'server-only'
import crypto from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'
import { billingOrders, billingPayments, billingSubscriptions, newId, nowIso, type BillingOrderDoc } from '@/lib/db/billing'
import { isSubscriptionLive } from '@/lib/entitlements-core'
import { decideReferralReward, paymentFingerprintSource, referralAbuse, rewardDueAt } from './referral-reward'
import { getBillingSettings } from './settings'
import { grantCredit } from './credits'

interface RewardRow {
  id: string; referrer_id: string; referee_id: string; order_id: string; currency: string; due_at: string
  status: 'pending' | 'granted' | 'void'; reason?: string; kind?: string; amount?: number; created_at: string; updated_at?: string
}

let ready: Promise<void> | null = null
async function col() {
  const c = (await getMongoDb()).collection<RewardRow>('billing_referral_rewards')
  if (!ready) {
    ready = Promise.all([
      c.createIndex({ referee_id: 1 }, { unique: true, name: 'billing_referral_rewards_referee_unique' }),
      c.createIndex({ status: 1, due_at: 1 }, { name: 'billing_referral_rewards_due' }),
      c.createIndex({ referrer_id: 1, status: 1 }, { name: 'billing_referral_rewards_referrer' }),
    ]).then(() => undefined).catch((e) => {
      ready = null
      console.error('[referrals] index setup failed:', (e as Error)?.message)
    })
  }
  await ready
  return c
}

/** Salted hash so raw IPs / instrument ids are never stored. */
export function signalHash(v: string): string {
  return crypto.createHash('sha256').update(`${process.env.BILLING_SIGNAL_SALT || 'codespectra-billing'}:${v}`).digest('hex').slice(0, 32)
}

/** Called once per paid order: start the referee's reward clock on their first paid plan order. */
export async function queueReferralReward(order: BillingOrderDoc): Promise<void> {
  if (order.amount_paise <= 0 || order.plan_kind === 'one_time' || order.plan_kind === 'licence') return
  const db = await getMongoDb()
  const red = await db.collection('referrals').findOne({ kind: 'redemption', referred_id: order.user_id, status: { $ne: 'rejected' } }, { projection: { referrer_id: 1 } })
  if (!red?.referrer_id || red.referrer_id === order.user_id) return
  const ts = nowIso()
  try {
    await (await col()).insertOne({
      id: newId(),
      referrer_id: String(red.referrer_id),
      referee_id: order.user_id,
      order_id: order.id,
      currency: order.currency,
      due_at: rewardDueAt(order.period_start || ts, order.period_end),
      status: 'pending',
      created_at: ts,
    })
  } catch (e) {
    if ((e as { code?: number })?.code !== 11000) throw e // the referee's first paid order already queued one
  }
}

async function signalsFor(userId: string): Promise<{ deviceIds: string[]; ips: string[]; paymentFingerprints: string[] }> {
  const db = await getMongoDb()
  const [prints, sessions, orders, payments] = await Promise.all([
    db.collection('device_fingerprints').find({ 'accounts.user_id': userId }, { projection: { _id: 0, visitorId: 1 } }).limit(50).toArray(),
    db.collection('session').find({ userId }, { projection: { _id: 0, ipAddress: 1 } }).limit(50).toArray().catch(() => []),
    (await billingOrders()).find({ user_id: userId, checkout_ip_hash: { $exists: true } } as never, { projection: { _id: 0, checkout_ip_hash: 1 } }).limit(50).toArray(),
    (await billingPayments()).find({ user_id: userId }, { projection: { _id: 0, raw_event: 1 } }).limit(50).toArray(),
  ])
  return {
    deviceIds: prints.map((p) => String(p.visitorId || '')).filter(Boolean),
    ips: [
      ...sessions.map((s) => (s.ipAddress ? signalHash(String(s.ipAddress)) : '')),
      ...orders.map((o) => String((o as { checkout_ip_hash?: string }).checkout_ip_hash || '')),
    ].filter(Boolean),
    paymentFingerprints: payments.map((p) => paymentFingerprintSource(p.raw_event as Record<string, unknown> | undefined)).filter((x): x is string => !!x).map(signalHash),
  }
}

/** Daily job: grant or void due rewards. Idempotent (atomic pending → granted claim). */
export async function processReferralRewards(now = new Date()): Promise<{ granted: number; voided: number }> {
  const c = await col()
  const settings = (await getBillingSettings()).referral_reward
  const due = await c.find({ status: 'pending', due_at: { $lte: now.toISOString() } }, { projection: { _id: 0 } }).limit(200).toArray()
  let granted = 0
  let voided = 0
  for (const r of due) {
    const order = await (await billingOrders()).findOne({ id: r.order_id }, { projection: { _id: 0, status: 1 } })
    const sub = await (await billingSubscriptions()).findOne({ user_id: r.referee_id, status: 'active' }, { sort: { ends_at: -1 }, projection: { _id: 0 } })
    const [a, b] = await Promise.all([signalsFor(r.referrer_id), signalsFor(r.referee_id)])
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString()
    const rewardsThisYear = await c.countDocuments({ referrer_id: r.referrer_id, status: 'granted', updated_at: { $gte: yearStart } })
    const outcome = decideReferralReward({
      dueAt: r.due_at, now, orderStatus: order?.status || 'missing', refereePlanLive: isSubscriptionLive(sub, now),
      abuse: referralAbuse({ referrer: a, referee: b }), rewardsThisYear, settings,
    })
    if (outcome === 'wait') continue
    if (outcome !== 'grant') {
      const v = await c.updateOne({ id: r.id, status: 'pending' }, { $set: { status: 'void', reason: outcome, updated_at: nowIso() } })
      voided += v.modifiedCount
      continue
    }
    const claim = await c.updateOne({ id: r.id, status: 'pending' }, { $set: { status: 'granted', kind: settings.kind, updated_at: nowIso() } })
    if (claim.modifiedCount === 0) continue
    if (settings.kind === 'credit') {
      const cur = r.currency === 'USD' ? 'USD' : 'INR'
      const amount = settings.credit_minor[cur]
      await grantCredit(r.referrer_id, cur, amount, r.id)
      await c.updateOne({ id: r.id }, { $set: { amount } })
    } else {
      await grantFreeMonth(r.referrer_id, r.id, now)
    }
    granted++
    const { notify } = await import('@/lib/notifications')
    await notify({
      user_id: r.referrer_id,
      type: 'billing.referral_reward',
      title: 'Referral reward added',
      message: settings.kind === 'credit' ? 'Credit was added to your account for a friend who joined Pro.' : 'You got a free month of Pro for a friend who joined Pro.',
      title_i18n: { key: 'billing.referralReward.title' },
      message_i18n: { key: settings.kind === 'credit' ? 'billing.referralReward.credit' : 'billing.referralReward.month' },
      link: '/dashboard/billing',
      icon: 'gift',
    }).catch(() => {})
  }
  return { granted, voided }
}

/** +30 days on the referrer's live plan, or a 30-day Pro period when they are on Free. */
async function grantFreeMonth(userId: string, rewardId: string, now: Date): Promise<void> {
  const subs = await billingSubscriptions()
  const live = await subs.findOne({ user_id: userId, status: 'active', ends_at: { $gt: now.toISOString() } }, { sort: { ends_at: -1 } })
  const DAY = 86_400_000
  if (live) {
    await subs.updateOne({ id: live.id, status: 'active' }, { $set: { ends_at: new Date(Date.parse(live.ends_at) + 30 * DAY).toISOString(), updated_at: nowIso() } })
    // A gateway subscription renews on its own date: push the next charge back too where supported.
    if (live.billing_mode === 'stripe_subscription' && live.stripe_subscription_id) {
      const { getStripeClient } = await import('@/lib/stripe-client')
      const stripe = await getStripeClient()
      await stripe.subscriptions.update(live.stripe_subscription_id, { trial_end: Math.floor((Date.parse(live.ends_at) + 30 * DAY) / 1000), proration_behavior: 'none' }).catch((e) =>
        console.error('[referrals] could not move Stripe renewal', (e as Error)?.message),
      )
    }
    return
  }
  const ts = nowIso()
  await subs.insertOne({
    id: newId(), user_id: userId, plan_id: 'pro', status: 'active', started_at: ts, ends_at: new Date(now.getTime() + 30 * DAY).toISOString(),
    billing_mode: 'prepaid', last_order_id: `referral:${rewardId}`, created_at: ts, updated_at: ts,
  })
}
