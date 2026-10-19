/**
 * Billing automations:
 *   AU-03         payment-failure dunning (day 0 / 3 / 7, update-card link, WhatsApp on the last day if consented)
 *   AU-04 / A-023 plan expiry reminders 7 / 3 / 1 days before a prepaid (or non-renewing) plan ends
 *   AU-05 / A-022 stuck payment reconciliation (PhonePe status API, Stripe session retrieve, Razorpay order payments)
 * Money is always integer minor units.
 */
import { getMongoDb } from '@/lib/mongodb'
import { emit } from '../events'
import { sendAutomationEmail } from '../mailer'
import { claimOnce, col, nowIso } from '../store'
import { getSystemSettings, configValue } from '../settings'
import { dueDunningStep, expiryReminderDay, needsExpiryReminder, reconcileAction, reconcileOutcome, type ProviderState } from './rules'
import type { SystemAutomation } from './types'

type Doc = Record<string, unknown>

/** Alert admins when a failing renewal is at least this big (minor units, any currency). */
const HIGH_VALUE_MINOR = 500_000

async function userOf(userId: string): Promise<{ id: string; email: string | null; name: string } | null> {
  const db = await getMongoDb()
  const u = await db.collection('user').findOne({ $or: [{ id: userId }, { _id: userId as never }] }, { projection: { id: 1, _id: 1, email: 1, name: 1, fullName: 1 } })
  return u ? { id: String(u.id || u._id), email: typeof u.email === 'string' ? u.email : null, name: String(u.fullName || u.name || '') } : null
}

const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toUTCString().slice(0, 16) : 'soon')

// ─── AU-03 dunning ──────────────────────────────────────────────────────────

export async function startDunning(p: Doc): Promise<void> {
  const subId = typeof p.subscription_id === 'string' ? p.subscription_id : ''
  const userId = typeof p.user_id === 'string' ? p.user_id : ''
  if (!subId || !userId) return
  const c = await col('billing_dunning')
  const ts = nowIso()
  await c.createIndex({ subscription_id: 1, episode: 1 }, { unique: true }).catch(() => {})
  const db = await getMongoDb()
  const sub = await db.collection('billing_subscriptions').findOne({ id: subId }, { projection: { past_due_since: 1 } })
  const episode = String(sub?.past_due_since || p.grace_ends_at || ts.slice(0, 10))
  try {
    await c.insertOne({ subscription_id: subId, episode, grace_ref: typeof p.grace_ends_at === 'string' ? p.grace_ends_at : null, user_id: userId, status: 'active', started_at: ts, sent: [], amount_minor: Number(p.amount_minor) || 0, currency: p.currency || null, created_at: ts })
  } catch { /* already running for this episode */ }
  await runDunning(new Date(), subId)
}

export async function runDunning(now = new Date(), onlySub?: string): Promise<{ sent: number; recovered: number }> {
  const c = await col('billing_dunning')
  const db = await getMongoDb()
  const rows = (await c.find({ status: 'active', ...(onlySub ? { subscription_id: onlySub } : {}) }).limit(500).toArray()) as Doc[]
  const settings = await getSystemSettings()
  let sent = 0
  let recovered = 0
  for (const d of rows) {
    const sub = (await db.collection('billing_subscriptions').findOne({ id: d.subscription_id })) as Doc | null
    const stillDue = !!sub && sub.status === 'active' && sub.past_due === true
    if (!stillDue) {
      await c.updateOne({ subscription_id: d.subscription_id, episode: d.episode }, { $set: { status: sub?.status === 'active' ? 'recovered' : 'ended', closed_at: nowIso() } })
      recovered++
      continue
    }
    const step = dueDunningStep(String(d.started_at), now, (d.sent as string[]) || [], stillDue)
    if (!step) continue
    // Claim the step first so overlapping sweeps never double-send.
    const r = await c.updateOne({ subscription_id: d.subscription_id, episode: d.episode, sent: { $ne: step.key } }, { $push: { sent: step.key } as never, $set: { [`sent_at.${step.key}`]: nowIso() } })
    if (!r.modifiedCount) continue
    const user = await userOf(String(d.user_id))
    if (!user) continue
    const graceEnd = String(sub!.grace_ends_at || sub!.ends_at || '')
    const plan = String(sub!.plan_id || 'your plan')
    const subject = step.final ? 'Last notice: your CodeSpectra plan is about to end' : step.day === 0 ? 'Your CodeSpectra payment didn’t go through' : 'Reminder: please update your payment method'
    if (user.email) {
      await sendAutomationEmail({
        to: user.email, userId: user.id, category: 'billing', urgent: true, onceKey: `dunning:${String(d.subscription_id)}:${String(d.episode)}:${step.key}`,
        // Same key as the "Payment dunning" template (AUTO-020).
        dedupe: { kind: 'dunning', ref: `${String(d.subscription_id)}:${String(d.grace_ref || d.episode)}:${step.key}` },
        subject,
        heading: step.final ? 'Your plan ends soon' : 'We couldn’t take your payment',
        bodyText: `Hi ${user.name || 'there'},\n\nWe couldn’t renew ${plan}. Your access continues until ${fmtDate(graceEnd)} — update your card before then to keep it.${step.final ? '\n\nThis is our last reminder.' : ''}`,
        cta: { label: 'Update payment method', url: '/dashboard/billing' },
        reason: 'You got this email because a payment for your CodeSpectra plan failed.',
      })
    }
    const { notify } = await import('@/lib/notifications')
    await notify({ user_id: user.id, type: 'billing.payment_failed', title: step.final ? 'Last reminder: update your card' : 'Payment failed — update your card', message: `Access continues until ${fmtDate(graceEnd)}.`, link: '/dashboard/billing', icon: 'alert-circle', skip_push: !step.final })
    if (step.channels.includes('whatsapp') && settings.config.wa_template_payment) {
      const { whatsappRecipientForUser, sendWhatsAppTemplate } = await import('../whatsapp')
      await sendWhatsAppTemplate(await whatsappRecipientForUser(user.id), { name: settings.config.wa_template_payment, language: configValue(settings.config, 'wa_template_language'), params: [user.name || 'there', fmtDate(graceEnd)] }, { userId: user.id }).catch(() => null)
    }
    if (step.day === 0 && Number(d.amount_minor) >= HIGH_VALUE_MINOR) {
      const { sendAdminAlert } = await import('../alerts')
      await sendAdminAlert({ key: `dunning-high:${String(d.subscription_id)}`, title: 'High-value renewal failed', detail: `A renewal of ${(Number(d.amount_minor) / 100).toFixed(2)} ${String(d.currency || '').toUpperCase()} failed (plan ${plan}). Dunning emails have started.`, severity: 'warning', link: '/dashboard/admin/billing', windowMinutes: 24 * 60 })
    }
    sent++
  }
  return { sent, recovered }
}

async function stopDunningForUser(userId: string): Promise<void> {
  const c = await col('billing_dunning')
  await c.updateMany({ user_id: userId, status: 'active' }, { $set: { status: 'recovered', closed_at: nowIso() } })
}

// ─── AU-04 expiry reminders ─────────────────────────────────────────────────

/** Plans due a 7 / 3 / 1-day reminder now (shared by the reminder emails and the always-on signals sweep). */
export async function expiringSubscriptions(now = new Date()): Promise<{ sub: Doc; day: 7 | 3 | 1 }[]> {
  const db = await getMongoDb()
  const { stripeAutoRenewEnabled } = await import('@/lib/stripe-client')
  const autoRenew = stripeAutoRenewEnabled()
  const horizon = new Date(now.getTime() + 7 * 86_400_000).toISOString()
  const subs = (await db.collection('billing_subscriptions').find({ status: 'active', ends_at: { $gt: now.toISOString(), $lte: horizon } }).limit(5000).toArray()) as Doc[]
  const out: { sub: Doc; day: 7 | 3 | 1 }[] = []
  for (const s of subs) {
    if (!needsExpiryReminder(s as never, autoRenew)) continue
    const day = expiryReminderDay(String(s.ends_at), now)
    if (day) out.push({ sub: s, day })
  }
  return out
}

/** Plans whose paid period ended in the last two days (Stripe plans that will renew are left out). */
export async function endedSubscriptions(now = new Date()): Promise<Doc[]> {
  const db = await getMongoDb()
  const ended = (await db.collection('billing_subscriptions').find({ ends_at: { $lte: now.toISOString(), $gte: new Date(now.getTime() - 2 * 86_400_000).toISOString() } }, { projection: { id: 1, user_id: 1, plan_id: 1, ends_at: 1, status: 1, billing_mode: 1, cancel_at_period_end: 1 } }).limit(5000).toArray()) as Doc[]
  return ended.filter((s) => !(s.billing_mode === 'stripe_subscription' && !s.cancel_at_period_end && s.status === 'active'))
}

/** Event signals for plans (always on, see ./signals.ts — AUTO-003). */
export async function emitSubscriptionSignals(now = new Date()): Promise<{ expiring: number; expired: number }> {
  const out = { expiring: 0, expired: 0 }
  for (const { sub: s, day } of await expiringSubscriptions(now)) {
    const user = await userOf(String(s.user_id))
    if (!user) continue
    const r = await emit('subscription.expiring', { subscription_id: s.id, user_id: user.id, email: user.email, plan_id: s.plan_id, ends_at: s.ends_at, days_left: day, renew_url: '/dashboard/billing' }, { idempotencyKey: `subscription.expiring:${String(s.id)}:${String(s.ends_at)}:${day}` })
    if (r.id) out.expiring++
  }
  for (const s of await endedSubscriptions(now)) {
    const user = await userOf(String(s.user_id))
    const r = await emit('subscription.expired', { subscription_id: s.id, user_id: s.user_id, email: user?.email ?? null, plan_id: s.plan_id, ended_at: s.ends_at }, { idempotencyKey: `subscription.expired:${String(s.id)}:${String(s.ends_at)}` })
    if (r.id) out.expired++
  }
  return out
}

export async function runExpiryReminders(now = new Date()): Promise<{ reminded: number }> {
  const settings = await getSystemSettings()
  let reminded = 0
  for (const { sub: s, day } of await expiringSubscriptions(now)) {
    if (!(await claimOnce(`expiry:${String(s.id)}:${String(s.ends_at)}:${day}`))) continue
    const user = await userOf(String(s.user_id))
    if (!user) continue
    const renewUrl = '/dashboard/billing'
    if (user.email) {
      await sendAutomationEmail({
        to: user.email, userId: user.id, category: 'billing',
        // Same key as the "Plan expiry reminders" template: a customer never gets both (AUTO-020).
        dedupe: { kind: 'plan-expiry', ref: `${String(s.id)}:${String(s.ends_at)}:${day}` },
        subject: day === 1 ? 'Your CodeSpectra plan ends tomorrow' : `Your CodeSpectra plan ends in ${day} days`,
        heading: `${day === 1 ? 'One day' : `${day} days`} left on your plan`,
        bodyText: `Your ${String(s.plan_id || 'plan')} ends on ${fmtDate(String(s.ends_at))}. Renew now to keep your tests, events and certificates without a break.`,
        cta: { label: 'Renew plan', url: renewUrl },
        reason: 'You got this email because your CodeSpectra plan is ending.',
      })
    }
    const { notify } = await import('@/lib/notifications')
    await notify({ user_id: user.id, type: 'billing.plan_expiring', title: `Your plan ends in ${day} day${day === 1 ? '' : 's'}`, message: `Renew before ${fmtDate(String(s.ends_at))} to keep access.`, link: renewUrl, icon: 'credit-card', skip_push: day !== 1 })
    if (day === 1 && settings.config.wa_template_payment) {
      const { whatsappRecipientForUser, sendWhatsAppTemplate } = await import('../whatsapp')
      await sendWhatsAppTemplate(await whatsappRecipientForUser(user.id), { name: settings.config.wa_template_payment, language: configValue(settings.config, 'wa_template_language'), params: [user.name || 'there', fmtDate(String(s.ends_at))] }, { userId: user.id }).catch(() => null)
    }
    reminded++
  }
  return { reminded }
}

// ─── AU-05 reconciliation ───────────────────────────────────────────────────

async function stripeState(sessionId: string): Promise<{ state: ProviderState; session?: unknown }> {
  const { getStripeClient } = await import('@/lib/stripe-client')
  const stripe = await getStripeClient()
  const s = await stripe.checkout.sessions.retrieve(sessionId)
  if (s.payment_status === 'paid' || s.payment_status === 'no_payment_required') return { state: 'paid', session: s }
  if (s.status === 'expired') return { state: 'expired', session: s }
  return { state: 'pending', session: s }
}

async function razorpaySettle(order: Doc): Promise<ProviderState> {
  const { isRazorpayConfigured, getRazorpay } = await import('@/lib/razorpay-server')
  if (!(await isRazorpayConfigured())) return 'unknown'
  const rzp = await getRazorpay()
  const res = (await (rzp.orders as unknown as { fetchPayments: (id: string) => Promise<{ items?: Doc[] }> }).fetchPayments(String(order.razorpay_order_id))) || {}
  const items = Array.isArray(res.items) ? res.items : []
  const captured = items.find((p) => p.status === 'captured' && Number(p.amount) >= Number(order.amount_paise))
  if (!captured) return items.some((p) => p.status === 'failed') && !items.some((p) => p.status === 'authorized') ? 'failed' : 'pending'
  // Same claim + activation path as the Razorpay webhook (idempotent per payment id).
  const { billingOrders, billingPayments, newId } = await import('@/lib/db/billing')
  const { activatePaidOrder } = await import('@/lib/billing-plans')
  const orders = await billingOrders()
  const claim = await orders.updateOne({ id: order.id as string, status: { $in: ['created', 'attempted', 'failed'] } }, { $set: { status: 'paid', updated_at: nowIso(), reconciled_at: nowIso() } } as never)
  if (!claim.modifiedCount) return 'paid'
  const payments = await billingPayments()
  const pid = String(captured.id)
  await payments.updateOne({ razorpay_payment_id: pid }, { $setOnInsert: { id: newId(), user_id: order.user_id as string, order_id: order.id as string, razorpay_payment_id: pid, status: 'captured', amount_paise: Number(captured.amount), created_at: nowIso() } } as never, { upsert: true }).catch(() => {})
  const row = await payments.findOne({ razorpay_payment_id: pid }, { projection: { id: 1 } })
  await activatePaidOrder({ ...(order as Record<string, unknown>), status: 'paid' } as never, row?.id)
  const { notify } = await import('@/lib/notifications')
  await notify({ user_id: String(order.user_id), type: 'billing.payment_success', title: 'Payment confirmed', message: 'We confirmed your payment and your plan is active.', link: '/dashboard/billing', icon: 'credit-card' })
  return 'paid'
}

export async function reconcileStuckOrders(now = new Date(), limit = 40): Promise<{ checked: number; paid: number; failed: number }> {
  const { billingOrders } = await import('@/lib/db/billing')
  const orders = await billingOrders()
  const rows = (await orders.find({
    status: { $in: ['created', 'attempted'] },
    created_at: { $lte: new Date(now.getTime() - 10 * 60_000).toISOString(), $gte: new Date(now.getTime() - 26 * 3_600_000).toISOString() },
    $or: [{ reconcile_checked_at: { $exists: false } }, { reconcile_checked_at: { $lte: new Date(now.getTime() - 14 * 60_000).toISOString() } }],
  } as never).sort({ created_at: 1 }).limit(limit).toArray()) as unknown as Doc[]
  const out = { checked: 0, paid: 0, failed: 0 }
  for (const o of rows) {
    const action = reconcileAction(o as never, now)
    if (action === 'skip') continue
    out.checked++
    await orders.updateOne({ id: o.id as string }, { $set: { reconcile_checked_at: now.toISOString() } } as never)
    let state: ProviderState = 'unknown'
    try {
      const notes = (o.notes || {}) as Doc
      if (typeof o.phonepe_transaction_id === 'string' && o.phonepe_transaction_id) {
        const { settlePhonePeOrder } = await import('@/lib/billing/phonepe-settle')
        const r = await settlePhonePeOrder(o.phonepe_transaction_id)
        state = r === 'success' ? 'paid' : r === 'failed' ? 'failed' : r === 'pending' ? 'pending' : 'unknown'
      } else if (typeof notes.stripe_session_id === 'string') {
        const r = await stripeState(notes.stripe_session_id)
        state = r.state
        const { syncCheckoutSessionCompleted, syncCheckoutSessionFailed } = await import('@/lib/stripe-webhook-sync')
        if (r.state === 'paid') await syncCheckoutSessionCompleted(r.session as never)
        if (r.state === 'expired') await syncCheckoutSessionFailed(r.session as never)
      } else if (typeof o.razorpay_order_id === 'string' && o.razorpay_order_id) {
        state = await razorpaySettle(o)
      }
    } catch (e) {
      console.error('[automation/reconcile] gateway check failed:', o.id, (e as Error).message)
      continue
    }
    const outcome = reconcileOutcome(state, now.getTime() - Date.parse(String(o.created_at)))
    if (outcome === 'paid') out.paid++
    if (outcome === 'failed') {
      const r = await orders.updateOne({ id: o.id as string, status: { $in: ['created', 'attempted'] } } as never, { $set: { status: 'failed', failure_reason: state === 'expired' ? 'checkout_expired' : state === 'failed' ? 'gateway_failed' : 'abandoned', updated_at: nowIso() } } as never)
      if (r.modifiedCount) out.failed++
    }
  }
  return out
}

export const BILLING_AUTOMATIONS: SystemAutomation[] = [
  {
    id: 'dunning',
    title: 'Payment-failure dunning',
    description: 'When a renewal fails: email + in-app notice on day 0, 3 and 7 with an update-card link, WhatsApp on the last day (only if they agreed and a template is set), and an admin alert for large accounts. Stops as soon as they pay.',
    group: 'Billing',
    refs: ['AU-03'],
    cadence: { kind: 'interval', minutes: 60 },
    run: async (now) => runDunning(now),
    events: [
      { type: 'payment.failed', handle: async (ev) => { if (ev.payload.subscription_id) await startDunning(ev.payload) } },
      { type: 'payment.succeeded', handle: async (ev) => { if (typeof ev.payload.user_id === 'string') await stopDunningForUser(ev.payload.user_id) } },
    ],
  },
  {
    id: 'plan-expiry',
    title: 'Plan expiry reminders',
    description: 'Prepaid plans (PhonePe / Razorpay) and Stripe plans with auto-renew off get an email and in-app reminder 7, 3 and 1 day before they end (WhatsApp on the last day if they agreed). The plan events for workflows come from “Event signals”, so they keep flowing when this is off.',
    group: 'Billing',
    refs: ['AU-04', 'A-023'],
    cadence: { kind: 'daily', hourUtc: 3, minuteUtc: 30 },
    run: async (now) => runExpiryReminders(now),
  },
  {
    id: 'payment-reconciliation',
    title: 'Stuck payment reconciliation',
    description: 'Every 15 minutes, re-checks orders still “created” after 10 minutes with the gateway (PhonePe status API, Stripe checkout session, Razorpay order payments): activates paid ones, closes failed or abandoned ones after 24 hours.',
    group: 'Billing',
    refs: ['AU-05', 'A-022'],
    cadence: { kind: 'interval', minutes: 15 },
    run: async (now) => reconcileStuckOrders(now),
  },
]
