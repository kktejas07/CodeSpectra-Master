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
import { billingOrders, billingPayments, billingSubscriptions, newId, nowIso, type BillingOrderDoc } from '@/lib/db/billing'
import { activatePaidOrder, ensureBillingIndexes } from '@/lib/billing-plans'
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
  await (await billingOrders()).updateOne(
    { id: order.id, status: { $in: ['created', 'attempted'] } },
    { $set: { status: 'failed', updated_at: nowIso() } },
  )
}

/** Sync a customer.subscription.updated / customer.subscription.deleted event */
export async function syncSubscriptionFromStripe(subscription: Stripe.Subscription): Promise<void> {
  const userId = String(subscription.metadata?.user_id || '')
  if (!userId) return

  const subs = await billingSubscriptions()
  const statusMap: Record<string, 'active' | 'cancelled' | 'past_due' | 'expired'> = {
    active: 'active',
    past_due: 'past_due',
    canceled: 'cancelled',
    unpaid: 'past_due',
    incomplete: 'past_due',
    trialing: 'active',
  }

  const mappedStatus = statusMap[subscription.status] || 'expired'
  const existing = await subs.findOne({ user_id: userId, status: 'active' })
  const sub = subscription as any
  const endsAt = new Date((sub.current_period_end || 0) * 1000).toISOString()

  if (existing) {
    await subs.updateOne(
      { id: existing.id },
      { $set: { status: mappedStatus, ends_at: endsAt, updated_at: nowIso() } },
    )
  } else {
    await subs.insertOne({
      id: newId(),
      user_id: userId,
      plan_id: String(subscription.metadata?.plan_id || 'pro_monthly'),
      status: mappedStatus,
      started_at: new Date((sub.current_period_start || 0) * 1000).toISOString(),
      ends_at: endsAt,
      created_at: nowIso(),
    })
  }
}

/** Sync an invoice.paid / invoice.payment_failed event */
export async function syncInvoiceFromStripe(invoice: Stripe.Invoice): Promise<void> {
  const inv = invoice as any
  const subscriptionId = String(inv.subscription || '')
  const userId = String(invoice.metadata?.user_id || '')
  // Checkout no longer creates Stripe subscriptions (see lib/stripe-adapter.ts);
  // this only records legacy subscription invoices for a known user.
  if (!userId) return

  const orders = await billingOrders()
  const existingOrder = subscriptionId
    ? await orders.findOne({ razorpay_order_id: `stripe_${subscriptionId}` })
    : null

  if (!existingOrder && invoice.amount_paid > 0) {
    const orderId = newId()
    await orders.insertOne({
      id: orderId,
      user_id: userId,
      razorpay_order_id: `stripe_${subscriptionId || invoice.id}`,
      amount_paise: invoice.amount_paid,
      currency: (invoice.currency || 'usd').toUpperCase(),
      plan_id: 'pro_monthly',
      receipt: `stripe_${invoice.id}`,
      status: invoice.status === 'paid' ? 'paid' : 'failed',
      notes: { stripe_invoice_id: invoice.id, provider: 'stripe' },
      created_at: nowIso(),
      updated_at: nowIso(),
    })

    if (invoice.status === 'paid') {
      const payments = await billingPayments()
      await payments.insertOne({
        id: newId(),
        user_id: userId,
        order_id: orderId,
        razorpay_payment_id: `stripe_${inv.payment_intent || invoice.id}`,
        status: 'captured',
        amount_paise: invoice.amount_paid,
        created_at: nowIso(),
      })
    }
  }
}
