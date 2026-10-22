/**
 * Razorpay Subscriptions (INR autopay via card / UPI mandate / e-mandate).
 *
 *  - Razorpay plans are created lazily per (plan, interval, amount) and cached in
 *    `billing_gateway_plans`, so an admin price change makes a new Razorpay plan.
 *  - Checkout creates a subscription with notes { user_id, plan_id, order_id, interval }
 *    and an order row (status created, razorpay_subscription_id). The first payment
 *    is confirmed by /api/billing/verify (signature payment_id|subscription_id) or by
 *    the subscription.charged webhook — whichever claims the order first.
 *  - Every later charge (subscription.charged) gets its own order keyed by the
 *    payment id (`razorpay_charge_id`, unique) and only the delivery that moves it
 *    to paid activates: replays are no-ops.
 *  - subscription.pending → past due + grace (dunning); halted → expired;
 *    cancelled / completed → access until the paid period ends.
 *  - Cancel at period end is local first (resumable); the sweep cancels at Razorpay
 *    shortly before the renewal date (Razorpay can't undo a scheduled cancel).
 */
import 'server-only'
import { getMongoDb } from '@/lib/mongodb'
import { getRazorpay, getPublishableKeyId } from '@/lib/razorpay-server'
import { billingOrders, billingPayments, billingSubscriptions, newId, nowIso, type BillingOrderDoc } from '@/lib/db/billing'
import { activatePaidOrder, ensureBillingIndexes, orderPlanSnapshot, type ResolvedPlan } from '@/lib/billing-plans'
import { graceDays, graceEndsAt } from '@/lib/billing-lifecycle'
import { addInterval } from './proration'
import { logger } from '@/lib/logger'

/** Billing cycles a subscription runs before Razorpay completes it (renew by checkout after). */
export const TOTAL_COUNT = { month: 120, year: 10 } as const
/** Cancel at Razorpay this long before the renewal date (the sweep runs at least daily). */
export const CANCEL_LEAD_MS = 72 * 3_600_000

const toIso = (sec: unknown): string | null => (typeof sec === 'number' && sec > 0 ? new Date(sec * 1000).toISOString() : null)

export function gatewayPlanKey(plan: Pick<ResolvedPlan, 'id' | 'interval' | 'currency' | 'amount_paise'>): string {
  return `razorpay:${plan.id}:${plan.interval}:${plan.currency}:${plan.amount_paise}`
}

/** Can this plan be sold as a Razorpay subscription? (INR, monthly / yearly, paid.) */
export function razorpayRecurringEligible(plan: Pick<ResolvedPlan, 'kind' | 'interval' | 'currency' | 'amount_paise'>): boolean {
  return plan.kind === 'subscription' && !!plan.interval && plan.currency === 'INR' && plan.amount_paise > 0
}

export async function ensureRazorpayPlan(plan: ResolvedPlan): Promise<string> {
  const key = gatewayPlanKey(plan)
  const col = (await getMongoDb()).collection<{ _id: string; gateway_plan_id: string; created_at: string }>('billing_gateway_plans')
  const hit = await col.findOne({ _id: key })
  if (hit) return hit.gateway_plan_id
  const rp = await getRazorpay()
  const created = await rp.plans.create({
    period: plan.interval === 'year' ? 'yearly' : 'monthly',
    interval: 1,
    item: { name: plan.name.slice(0, 100), amount: plan.amount_paise, currency: 'INR', description: `${plan.id} (${plan.interval})` },
    notes: { plan_id: plan.id, interval: String(plan.interval) },
  })
  // Two concurrent checkouts may both create a plan; the first cached one wins (the other is unused).
  await col.updateOne({ _id: key }, { $setOnInsert: { gateway_plan_id: created.id, created_at: nowIso() } }, { upsert: true })
  return (await col.findOne({ _id: key }))!.gateway_plan_id
}

/** Start a Razorpay subscription checkout for a resolved (list-price) plan. */
export async function createRazorpaySubscriptionCheckout(userId: string, plan: ResolvedPlan): Promise<{ subscription_id: string; key_id: string; order_id: string }> {
  const gatewayPlan = await ensureRazorpayPlan(plan)
  const orderId = newId()
  const rp = await getRazorpay()
  const sub = await rp.subscriptions.create({
    plan_id: gatewayPlan,
    total_count: TOTAL_COUNT[plan.interval === 'year' ? 'year' : 'month'],
    customer_notify: 1,
    notes: { user_id: userId, plan_id: plan.id, order_id: orderId, interval: String(plan.interval) },
  })
  const ts = nowIso()
  await (await billingOrders()).insertOne({
    id: orderId,
    user_id: userId,
    amount_paise: plan.amount_paise,
    currency: plan.currency,
    ...orderPlanSnapshot(plan),
    receipt: `${userId}_${plan.id}_${Date.now()}`,
    status: 'created',
    razorpay_subscription_id: sub.id,
    notes: { provider: 'razorpay', razorpay_mode: 'subscription' },
    created_at: ts,
    updated_at: ts,
  })
  return { subscription_id: sub.id, key_id: (await getPublishableKeyId()) || '', order_id: orderId }
}

export async function cancelRazorpaySubscription(subscriptionId: string, atCycleEnd: boolean): Promise<void> {
  const rp = await getRazorpay()
  await rp.subscriptions.cancel(subscriptionId, atCycleEnd)
}

/** Charge the new plan's price from the next renewal (after a prorated upgrade was paid). */
export async function switchRazorpaySubscriptionPlan(subscriptionId: string, plan: ResolvedPlan): Promise<void> {
  const gatewayPlan = await ensureRazorpayPlan(plan)
  const rp = await getRazorpay()
  await rp.subscriptions.update(subscriptionId, { plan_id: gatewayPlan, schedule_change_at: 'cycle_end' } as never)
}

interface RzpSubEntity { id: string; status?: string; current_start?: number | null; current_end?: number | null; notes?: Record<string, unknown> | unknown[]; plan_id?: string }

function notesOf(e: RzpSubEntity): Record<string, string> {
  const n = e.notes && !Array.isArray(e.notes) ? (e.notes as Record<string, unknown>) : {}
  return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, String(v ?? '')]))
}

/** Period for activation: Razorpay's current cycle, else (first charge, not yet reported) now + interval. */
export function periodOf(e: RzpSubEntity, interval: 'month' | 'year', now = new Date()): { start: string; end: string } {
  const start = toIso(e.current_start)
  const end = toIso(e.current_end)
  if (start && end && Date.parse(end) > now.getTime()) return { start, end }
  return { start: now.toISOString(), end: addInterval(now, interval).toISOString() }
}

async function recordPayment(order: BillingOrderDoc, pay: Record<string, unknown>): Promise<string> {
  const payments = await billingPayments()
  const paymentId = String(pay.id || '')
  try {
    await payments.updateOne(
      { razorpay_payment_id: paymentId },
      {
        $setOnInsert: {
          id: newId(), user_id: order.user_id, order_id: order.id, razorpay_payment_id: paymentId, status: 'captured',
          amount_paise: Number(pay.amount || 0), method: String(pay.method || ''), created_at: nowIso(), raw_event: pay,
        },
      },
      { upsert: true },
    )
  } catch (e) {
    if ((e as { code?: number })?.code !== 11000) throw e
  }
  const row = await payments.findOne({ razorpay_payment_id: paymentId }, { projection: { id: 1 } })
  return row?.id ?? ''
}

/**
 * First payment confirmed from the browser (after the signature was checked by the caller).
 * Returns the activated order or null when another delivery already did it.
 */
export async function confirmFirstSubscriptionPayment(userId: string, subscriptionId: string, paymentId: string): Promise<{ ok: true; order: BillingOrderDoc; activated: boolean } | { ok: false; code: 'order_not_found' | 'payment_mismatch' }> {
  await ensureBillingIndexes()
  const orders = await billingOrders()
  const order = await orders.findOne({ razorpay_subscription_id: subscriptionId, user_id: userId }, { sort: { created_at: 1 } })
  if (!order) return { ok: false, code: 'order_not_found' }
  if (order.status === 'paid') return { ok: true, order, activated: false }
  const rp = await getRazorpay()
  const [pay, sub] = await Promise.all([rp.payments.fetch(paymentId), rp.subscriptions.fetch(subscriptionId)])
  const p = pay as unknown as Record<string, unknown>
  if (Number(p.amount) < order.amount_paise || String(p.currency).toUpperCase() !== order.currency.toUpperCase() || !['captured', 'authorized'].includes(String(p.status))) {
    return { ok: false, code: 'payment_mismatch' }
  }
  if (String((p as { subscription_id?: unknown }).subscription_id || subscriptionId) !== subscriptionId) return { ok: false, code: 'payment_mismatch' }
  const activated = await claimAndActivate(order, p, sub as unknown as RzpSubEntity)
  return { ok: true, order, activated }
}

async function claimAndActivate(order: BillingOrderDoc, pay: Record<string, unknown>, sub: RzpSubEntity): Promise<boolean> {
  const orders = await billingOrders()
  const claim = await orders.updateOne(
    { id: order.id, status: { $in: ['created', 'attempted', 'failed'] } },
    { $set: { status: 'paid', razorpay_charge_id: String(pay.id), updated_at: nowIso() } },
  )
  if (claim.modifiedCount === 0) return false
  const paymentRowId = await recordPayment(order, pay)
  const period = periodOf(sub, order.interval === 'year' ? 'year' : 'month')
  await activatePaidOrder({ ...order, status: 'paid' }, paymentRowId, undefined, { periodStart: period.start, periodEnd: period.end, subscriptionId: sub.id })
  return true
}

type Entities = Record<string, { entity: Record<string, unknown> } | undefined>

/** Handle one verified Razorpay `subscription.*` webhook. Idempotent. */
export async function syncRazorpaySubscriptionEvent(event: string, entities: Entities, now = new Date()): Promise<void> {
  const sub = entities.subscription?.entity as unknown as RzpSubEntity | undefined
  if (!sub?.id) return
  const notes = notesOf(sub)
  const subs = await billingSubscriptions()
  const ts = now.toISOString()

  if (event === 'subscription.charged') {
    const pay = entities.payment?.entity
    if (!pay?.id || !notes.user_id || !notes.plan_id) return
    await ensureBillingIndexes()
    const orders = await billingOrders()
    if (await orders.findOne({ razorpay_charge_id: String(pay.id), status: 'paid' })) return
    // First charge: the order created at checkout.
    const first = notes.order_id ? await orders.findOne({ id: notes.order_id, user_id: notes.user_id, razorpay_subscription_id: sub.id }) : null
    if (first && ['created', 'attempted', 'failed'].includes(first.status)) {
      if (Number(pay.amount) < first.amount_paise || String(pay.currency).toUpperCase() !== first.currency.toUpperCase()) {
        console.error('[razorpay-subs] first charge amount/currency mismatch — not activating', { order: first.id })
        return
      }
      await claimAndActivate(first, pay, sub)
      return
    }
    // Renewal: one order per payment id.
    const template = first ?? (await orders.findOne({ razorpay_subscription_id: sub.id }, { sort: { created_at: 1 } }))
    if (!template || template.user_id !== notes.user_id) return
    if (String(pay.currency).toUpperCase() !== template.currency.toUpperCase()) return
    const interval = template.interval === 'year' ? 'year' : 'month'
    // The plan may have been switched (prorated upgrade): take the current plan from our subscription row.
    const live = await subs.findOne({ razorpay_subscription_id: sub.id }, { sort: { updated_at: -1 } })
    const planId = live?.plan_id || notes.plan_id
    try {
      await orders.updateOne(
        { razorpay_charge_id: String(pay.id) },
        {
          $setOnInsert: {
            id: newId(), user_id: template.user_id, amount_paise: Number(pay.amount || 0), currency: template.currency,
            plan_id: planId, plan_name: template.plan_name, plan_kind: 'subscription', interval, duration_days: interval === 'year' ? 365 : 30,
            receipt: `rzp_${String(pay.id)}`, status: 'created', razorpay_subscription_id: sub.id, razorpay_charge_id: String(pay.id),
            notes: { provider: 'razorpay', razorpay_mode: 'subscription' }, created_at: ts, updated_at: ts,
          },
        },
        { upsert: true },
      )
    } catch (e) {
      if ((e as { code?: number })?.code !== 11000) throw e
    }
    const claim = await orders.updateOne({ razorpay_charge_id: String(pay.id), status: 'created' }, { $set: { status: 'paid', updated_at: ts } })
    if (claim.modifiedCount === 0) return
    const order = (await orders.findOne({ razorpay_charge_id: String(pay.id) }))!
    const paymentRowId = await recordPayment(order, pay)
    const period = periodOf(sub, interval, now)
    await activatePaidOrder(order, paymentRowId, undefined, { periodStart: period.start, periodEnd: period.end, subscriptionId: sub.id })
    logger.webhook('[razorpay-subs] renewal activated', { order: order.id, endsAt: period.end })
    return
  }

  const row = await subs.findOne({ razorpay_subscription_id: sub.id, status: 'active' })
  if (!row) return

  if (event === 'subscription.pending') {
    if (row.past_due) return
    const graceEnd = graceEndsAt({ failedAt: now, endsAt: row.ends_at, days: graceDays() })
    const r = await subs.updateOne(
      { id: row.id, status: 'active', past_due: { $ne: true } } as never,
      { $set: { past_due: true, past_due_since: ts, grace_ends_at: graceEnd, ends_at: graceEnd, updated_at: ts } },
    )
    if (r.modifiedCount) {
      void import('@/lib/automation/events').then(({ emit }) => emit('payment.failed', {
        order_id: null, user_id: row.user_id, subscription_id: row.id, plan_id: row.plan_id, amount_minor: 0, currency: 'INR',
        provider: 'razorpay', kind: 'renewal', grace_ends_at: graceEnd,
      }, { idempotencyKey: `payment.failed:razorpay:${sub.id}:${ts.slice(0, 10)}` })).catch((e) => console.error('[automation] emit failed:', e))
    }
    return
  }
  if (event === 'subscription.halted') {
    await subs.updateOne({ id: row.id, status: 'active' }, { $set: { status: 'expired', ends_at: ts < row.ends_at ? ts : row.ends_at, ended_reason: 'payment_failed', updated_at: ts } })
    return
  }
  if (event === 'subscription.cancelled' || event === 'subscription.completed') {
    // Access stays until the period already paid for ends; it just won't renew.
    await subs.updateOne({ id: row.id, status: 'active' }, { $set: { cancel_at_period_end: true, cancelled_at: row.cancelled_at || ts, razorpay_cancelled_at: ts, ended_reason: event === 'subscription.completed' ? 'gateway_completed' : 'gateway_cancelled', updated_at: ts } as never })
    return
  }
  if (event === 'subscription.activated' || event === 'subscription.resumed') {
    if (row.past_due && sub.status === 'active') {
      await subs.updateOne({ id: row.id }, { $unset: { past_due: '', past_due_since: '', grace_ends_at: '' }, $set: { updated_at: ts } } as never)
    }
  }
}

/**
 * Daily (or more often): subscriptions the user cancelled locally whose renewal
 * is within CANCEL_LEAD_MS are cancelled at Razorpay now, so no further charge.
 */
export async function sweepRazorpayCancellations(now = new Date()): Promise<number> {
  const subs = await billingSubscriptions()
  const due = await subs
    .find({
      status: 'active', billing_mode: 'razorpay_subscription', cancel_at_period_end: true,
      razorpay_cancelled_at: { $exists: false }, ends_at: { $lte: new Date(now.getTime() + CANCEL_LEAD_MS).toISOString() },
    } as never, { projection: { _id: 0, id: 1, razorpay_subscription_id: 1 } })
    .limit(500)
    .toArray()
  let n = 0
  for (const s of due) {
    if (!s.razorpay_subscription_id) continue
    try {
      await cancelRazorpaySubscription(s.razorpay_subscription_id, false)
      await subs.updateOne({ id: s.id }, { $set: { razorpay_cancelled_at: now.toISOString() } as never })
      n++
    } catch (e) {
      console.error('[razorpay-subs] cancel failed', s.id, (e as Error)?.message)
    }
  }
  return n
}
