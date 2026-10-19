/**
 * Stripe webhook → MongoDB sync.
 *
 * Writes to the same billing_orders / billing_payments / billing_subscriptions
 * collections as Razorpay / PhonePe. Checkout activation mirrors the Razorpay
 * webhook: find the order created at checkout (lib/stripe-adapter.ts), check
 * the paid amount, claim the order atomically (created → paid) and only the
 * claimer records the payment and calls the shared activatePaidOrder().
 *
 * Amounts: Stripe reports amounts in the smallest currency unit (cents /
 * paise) — the same unit as our `amount_paise` fields — so they are stored
 * as-is, never divided by 100.
 */
import type Stripe from 'stripe'
import { billingOrders, billingPayments, billingSubscriptions, newId, nowIso, type BillingOrderDoc, type BillingSubscriptionDoc } from '@/lib/db/billing'
import { activatePaidOrder, ensureBillingIndexes } from '@/lib/billing-plans'
import { getStripeClient } from '@/lib/stripe-client'
import { invoiceSubscriptionId, stripeId, stripeSubscriptionPeriod } from '@/lib/stripe-subscriptions'
import { graceDays, graceEndsAt, stripeSubOutcome } from '@/lib/billing-lifecycle'
import { notify } from '@/lib/notifications'
import { logger } from '@/lib/logger'

async function findOrderForSession(session: Stripe.Checkout.Session): Promise<BillingOrderDoc | null> {
  const orders = await billingOrders()
  const orderId = String(session.metadata?.order_id || session.client_reference_id || '')
  const userId = String(session.metadata?.user_id || '')
  if (orderId) {
    const byId = await orders.findOne({ id: orderId })
    // The session must be the one created for this order (and its user).
    if (byId && (!userId || byId.user_id === userId) &&
        (!byId.razorpay_order_id || byId.razorpay_order_id === `stripe_${session.id}`)) {
      return byId
    }
  }
  return orders.findOne({ razorpay_order_id: `stripe_${session.id}` })
}

/**
 * checkout.session.completed / checkout.session.async_payment_succeeded.
 * Idempotent: Stripe retries webhooks; a replay finds the order already paid
 * and does nothing.
 */
export async function syncCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  if (session.mode === 'subscription') {
    // Recurring plans activate on invoice.paid (first and every renewal);
    // here we only remember the Stripe ids on the order.
    const order = await findOrderForSession(session)
    if (!order) return
    const customer = stripeId(session.customer)
    const subscription = stripeId(session.subscription)
    await (await billingOrders()).updateOne(
      { id: order.id },
      { $set: { ...(customer ? { stripe_customer_id: customer } : {}), ...(subscription ? { stripe_subscription_id: subscription } : {}), updated_at: nowIso() } },
    )
    return
  }
  if (session.payment_status !== 'paid') {
    // Async methods complete later via checkout.session.async_payment_succeeded.
    logger.webhook('[stripe-webhook] session completed but not paid yet', { sessionId: session.id, status: session.payment_status })
    return
  }

  const order = await findOrderForSession(session)
  if (!order) {
    // Only sessions created by our checkout (with a stored order) activate a plan.
    console.error('[stripe-webhook] no order for checkout session', { sessionId: session.id })
    return
  }

  const paid = Number(session.amount_total || 0)
  const currencyOk = (session.currency || '').toLowerCase() === (order.currency || '').toLowerCase()
  if (!currencyOk || paid < order.amount_paise) {
    console.error('[stripe-webhook] amount/currency mismatch — not activating', {
      order: order.id, paid, expected: order.amount_paise, currency: session.currency, orderCurrency: order.currency,
    })
    return
  }

  await ensureBillingIndexes()
  const orders = await billingOrders()
  // Atomic claim: only one delivery (or a concurrent retry) applies the order.
  const claim = await orders.updateOne(
    { id: order.id, status: { $in: ['created', 'attempted', 'failed'] } },
    { $set: { status: 'paid', razorpay_order_id: `stripe_${session.id}`, updated_at: nowIso() } },
  )
  if (claim.modifiedCount === 0) {
    logger.webhook('[stripe-webhook] order already applied, skipping', { order: order.id, sessionId: session.id })
    return
  }

  const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
  const gatewayPaymentId = `stripe_${paymentIntent || session.id}`
  const payments = await billingPayments()
  const paymentRowId = newId()
  try {
    await payments.updateOne(
      { razorpay_payment_id: gatewayPaymentId },
      {
        $setOnInsert: {
          id: paymentRowId,
          user_id: order.user_id,
          order_id: order.id,
          razorpay_payment_id: gatewayPaymentId,
          status: 'captured',
          amount_paise: paid,
          method: 'card',
          created_at: nowIso(),
        },
      },
      { upsert: true },
    )
  } catch (e) {
    if ((e as { code?: number })?.code !== 11000) throw e
  }

  const result = await activatePaidOrder({ ...order, status: 'paid' }, paymentRowId)
  logger.webhook('[stripe-webhook] order activated', { order: order.id, userId: order.user_id, planId: order.plan_id, endsAt: result.subscription?.ends_at })

  notify({
    user_id: order.user_id,
    type: 'billing.payment_success',
    title: 'Payment successful',
    message: `Payment of ${(paid / 100).toFixed(2)} ${order.currency.toUpperCase()} completed.`,
    icon: 'credit-card',
    link: '/dashboard/billing',
  }).catch(() => {})
}

/** checkout.session.async_payment_failed / checkout.session.expired: an unpaid order fails. */
export async function syncCheckoutSessionFailed(session: Stripe.Checkout.Session): Promise<void> {
  const order = await findOrderForSession(session)
  if (!order) return
  const r = await (await billingOrders()).updateOne(
    { id: order.id, status: { $in: ['created', 'attempted'] } },
    { $set: { status: 'failed', updated_at: nowIso() } },
  )
  if (r.modifiedCount) void import('@/lib/automation/events').then(({ emit }) => emit('payment.failed', { order_id: order.id, user_id: order.user_id, plan_id: order.plan_id, amount_minor: order.amount_paise, currency: order.currency, provider: 'stripe', kind: 'checkout' }, { idempotencyKey: `payment.failed:${order.id}` })).catch((e) => console.error('[automation] emit failed:', e))
}

// ─── Recurring subscriptions ────────────────────────────────────────────────

const money = (minor: number, currency: string) => `${(minor / 100).toFixed(2)} ${currency.toUpperCase()}`

/**
 * invoice.paid for a subscription we created: record the payment and extend
 * the period through the same activatePaidOrder() path. Idempotent per
 * invoice id — the first invoice claims the checkout order, every later one
 * gets its own order keyed by `stripe_invoice_id` (unique index), and only
 * the delivery that moves that order to `paid` activates.
 */
export async function syncInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const subscriptionId = invoiceSubscriptionId(invoice)
  if (!subscriptionId) return // one-off payments activate on checkout.session.completed
  if (invoice.status !== 'paid') return

  await ensureBillingIndexes()
  const orders = await billingOrders()
  const done = await orders.findOne({ stripe_invoice_id: invoice.id }, { projection: { status: 1 } })
  if (done && done.status !== 'created') {
    logger.webhook('[stripe-webhook] invoice already applied, skipping', { invoice: invoice.id })
    return
  }

  // Authoritative subscription state (metadata we set at checkout, period) from Stripe.
  const stripe = await getStripeClient()
  const sub = await stripe.subscriptions.retrieve(subscriptionId)
  const userId = String(sub.metadata?.user_id || '')
  const planId = String(sub.metadata?.plan_id || '')
  const period = stripeSubscriptionPeriod(sub)
  if (!userId || !planId || !period) {
    console.error('[stripe-webhook] invoice for a subscription without our metadata — ignored', { invoice: invoice.id, subscriptionId })
    return
  }
  const customerId = stripeId(sub.customer) || stripeId(invoice.customer) || ''
  const paid = Number(invoice.amount_paid || 0)
  const currency = (invoice.currency || '').toUpperCase()
  const ts = nowIso()

  // First invoice: claim the order created at checkout (checked against what was charged).
  let order: BillingOrderDoc | null = null
  const firstOrderId = String(sub.metadata?.order_id || '')
  if (firstOrderId) {
    const first = await orders.findOne({ id: firstOrderId, user_id: userId })
    if (first && !first.stripe_invoice_id && ['created', 'attempted', 'failed'].includes(first.status)) {
      if (currency !== first.currency.toUpperCase() || paid < first.amount_paise) {
        console.error('[stripe-webhook] first invoice amount/currency mismatch — not activating', {
          order: first.id, paid, expected: first.amount_paise, currency, orderCurrency: first.currency,
        })
        return
      }
      const claim = await orders.updateOne(
        { id: first.id, status: { $in: ['created', 'attempted', 'failed'] }, stripe_invoice_id: { $exists: false } },
        { $set: { status: 'paid', stripe_invoice_id: invoice.id, stripe_subscription_id: subscriptionId, stripe_customer_id: customerId, updated_at: ts } },
      )
      if (claim.modifiedCount > 0) order = { ...first, status: 'paid', stripe_invoice_id: invoice.id }
    }
  }

  // Renewal (or replay): one order per invoice id.
  if (!order) {
    const template = firstOrderId ? await orders.findOne({ id: firstOrderId, user_id: userId }) : null
    if (template && currency !== template.currency.toUpperCase()) {
      console.error('[stripe-webhook] renewal currency mismatch — not activating', { invoice: invoice.id, currency, expected: template.currency })
      return
    }
    const interval = template?.interval ?? (sub.metadata?.interval === 'year' ? 'year' : 'month')
    try {
      await orders.updateOne(
        { stripe_invoice_id: invoice.id },
        {
          $setOnInsert: {
            id: newId(),
            user_id: userId,
            razorpay_order_id: `stripe_${invoice.id}`,
            amount_paise: paid,
            currency: currency || template?.currency || 'USD',
            plan_id: planId,
            plan_name: template?.plan_name,
            plan_kind: 'subscription',
            interval,
            duration_days: interval === 'year' ? 365 : 30,
            receipt: `stripe_${invoice.id}`,
            status: 'created',
            stripe_invoice_id: invoice.id,
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: customerId,
            notes: { provider: 'stripe', stripe_mode: 'subscription', billing_reason: String(invoice.billing_reason || '') },
            created_at: ts,
            updated_at: ts,
          },
        },
        { upsert: true },
      )
    } catch (e) {
      if ((e as { code?: number })?.code !== 11000) throw e
    }
    const claim = await orders.updateOne(
      { stripe_invoice_id: invoice.id, status: 'created' },
      { $set: { status: 'paid', updated_at: ts } },
    )
    if (claim.modifiedCount === 0) {
      logger.webhook('[stripe-webhook] invoice already applied, skipping', { invoice: invoice.id })
      return
    }
    order = await orders.findOne({ stripe_invoice_id: invoice.id })
    if (!order) return
  }

  const gatewayPaymentId = `stripe_${invoice.id}`
  const paymentRowId = newId()
  try {
    await (await billingPayments()).updateOne(
      { razorpay_payment_id: gatewayPaymentId },
      {
        $setOnInsert: {
          id: paymentRowId,
          user_id: userId,
          order_id: order.id,
          razorpay_payment_id: gatewayPaymentId,
          status: 'captured',
          amount_paise: paid,
          method: 'card',
          created_at: ts,
        },
      },
      { upsert: true },
    )
  } catch (e) {
    if ((e as { code?: number })?.code !== 11000) throw e
  }

  const result = await activatePaidOrder(order, paymentRowId, {
    periodStart: period.start,
    periodEnd: period.end,
    customerId,
    subscriptionId,
  })
  // Stripe owns cancel-at-period-end for this subscription; mirror it.
  if (result.subscription) {
    await (await billingSubscriptions()).updateOne(
      { id: result.subscription.id },
      { $set: { cancel_at_period_end: sub.cancel_at_period_end === true || !!sub.cancel_at } },
    )
  }
  logger.webhook('[stripe-webhook] invoice activated', { invoice: invoice.id, order: order.id, userId, planId, endsAt: result.subscription?.ends_at })

  notify({
    user_id: userId,
    type: 'billing.payment_success',
    title: invoice.billing_reason === 'subscription_cycle' ? 'Plan renewed' : 'Payment successful',
    message: `Payment of ${money(paid, currency || order.currency)} completed.`,
    icon: 'credit-card',
    link: '/dashboard/billing',
  }).catch(() => {})
}

async function subForStripeId(subscriptionId: string): Promise<BillingSubscriptionDoc | null> {
  return (await billingSubscriptions()).findOne({ stripe_subscription_id: subscriptionId }, { sort: { updated_at: -1 } })
}

/**
 * invoice.payment_failed: mark the subscription past due and keep access for
 * a grace window (BILLING_GRACE_DAYS, default 7) while Stripe retries. A later
 * invoice.paid clears it; Stripe ending the subscription, or the grace sweep
 * (endLapsedGracePeriods), downgrades the user.
 */
export async function syncInvoicePaymentFailed(invoice: Stripe.Invoice, now: Date = new Date()): Promise<void> {
  const subscriptionId = invoiceSubscriptionId(invoice)
  if (!subscriptionId) return
  const sub = await subForStripeId(subscriptionId)
  if (!sub || sub.status !== 'active') return // first payment failed (nothing activated) or already ended

  const graceEnd = graceEndsAt({ failedAt: now, endsAt: sub.ends_at, currentGraceEndsAt: sub.past_due ? sub.grace_ends_at : null, days: graceDays() })
  const ts = now.toISOString()
  const res = await (await billingSubscriptions()).updateOne(
    { id: sub.id, status: 'active' },
    { $set: { past_due: true, past_due_since: sub.past_due_since || ts, grace_ends_at: graceEnd, ends_at: graceEnd, updated_at: ts } },
  )
  if (res.modifiedCount === 0 || sub.past_due) return // notify once per past-due episode
  void import('@/lib/automation/events').then(({ emit }) => emit('payment.failed', {
    order_id: null, user_id: sub.user_id, subscription_id: sub.id, plan_id: sub.plan_id, amount_minor: Number(invoice.amount_due || 0), currency: String(invoice.currency || ''),
    provider: 'stripe', kind: 'renewal', grace_ends_at: graceEnd,
  }, { idempotencyKey: `payment.failed:stripe:${invoice.id}` })).catch((e) => console.error('[automation] emit failed:', e))

  notify({
    user_id: sub.user_id,
    type: 'billing.payment_failed',
    title: 'Payment failed',
    message: `We couldn't renew your plan. Update your payment method by ${new Date(graceEnd).toUTCString().slice(0, 16)} to keep access.`,
    icon: 'alert-circle',
    link: '/dashboard/billing',
  }).catch(() => {})
}

/**
 * customer.subscription.updated / .deleted for the subscription we track:
 * mirror cancel-at-period-end (portal or our Cancel button), past-due, and
 * the end of the subscription. Events for any other subscription id (e.g. one
 * replaced by a plan change) are ignored.
 */
export async function syncSubscriptionFromStripe(subscription: Stripe.Subscription, deleted = false, now: Date = new Date()): Promise<void> {
  const sub = await subForStripeId(subscription.id)
  if (!sub) return
  const subs = await billingSubscriptions()
  const ts = now.toISOString()
  const outcome = deleted ? 'ended' : stripeSubOutcome(subscription.status)

  if (outcome === 'ended') {
    if (sub.status !== 'active') return
    const endedAtSec = subscription.ended_at || subscription.canceled_at
    const endedAt = endedAtSec ? new Date(endedAtSec * 1000).toISOString() : ts
    // Access stops when Stripe ends it (never later than what was paid for).
    const endsAt = Date.parse(endedAt) < Date.parse(sub.ends_at) ? endedAt : sub.ends_at
    await subs.updateOne(
      { id: sub.id, status: 'active' },
      {
        $set: {
          status: subscription.status === 'unpaid' || sub.past_due ? 'expired' : 'cancelled',
          ends_at: endsAt,
          ended_reason: sub.past_due || subscription.status === 'unpaid' ? 'payment_failed' : 'stripe_ended',
          cancel_at_period_end: false,
          updated_at: ts,
        },
      },
    )
    notify({
      user_id: sub.user_id,
      type: 'billing.subscription_cancelled',
      title: 'Subscription ended',
      message: 'Your paid plan has ended. You are on the free plan now.',
      icon: 'credit-card',
      link: '/dashboard/billing',
    }).catch(() => {})
    return
  }

  if (sub.status !== 'active') return
  const cancelling = subscription.cancel_at_period_end === true || !!subscription.cancel_at
  await subs.updateOne(
    { id: sub.id, status: 'active' },
    cancelling
      ? { $set: { cancel_at_period_end: true, cancelled_at: sub.cancelled_at || ts, updated_at: ts } }
      : { $set: { cancel_at_period_end: false, updated_at: ts }, $unset: { cancelled_at: '' } },
  )
  if (outcome === 'past_due' && !sub.past_due) {
    const graceEnd = graceEndsAt({ failedAt: now, endsAt: sub.ends_at, days: graceDays() })
    await subs.updateOne(
      { id: sub.id, status: 'active' },
      { $set: { past_due: true, past_due_since: ts, grace_ends_at: graceEnd, ends_at: graceEnd, updated_at: ts } },
    )
  }
}

/** @deprecated kept for callers of the old name; routes call syncInvoicePaid / syncInvoicePaymentFailed. */
export async function syncInvoiceFromStripe(invoice: Stripe.Invoice): Promise<void> {
  if (invoice.status === 'paid') return syncInvoicePaid(invoice)
  return syncInvoicePaymentFailed(invoice)
}
