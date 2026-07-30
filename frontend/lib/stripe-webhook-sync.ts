/**
 * Stripe webhook → MongoDB sync.
 *
 * Parses Stripe webhook events and writes to the same billing_orders /
 * billing_payments / billing_subscriptions collections used by the Razorpay
 * integration, so both payment providers share a common data model.
 */
import type Stripe from 'stripe'
import { billingOrders, billingPayments, billingSubscriptions, recordCouponRedemption, newId, nowIso } from '@/lib/db/billing'

/** Sync a checkout.session.completed event from Stripe */
export async function syncCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const userId = String(session.metadata?.user_id || '')
  const planId = String(session.metadata?.plan_id || 'pro_monthly')
  if (!userId) return

  const orders = await billingOrders()
  const orderId = newId()
  await orders.insertOne({
    id: orderId,
    user_id: userId,
    razorpay_order_id: `stripe_${session.id}`,
    amount_paise: Math.round((session.amount_total || 0) / 100),
    currency: (session.currency || 'usd').toUpperCase(),
    plan_id: planId,
    receipt: `stripe_${session.id}`,
    status: session.payment_status === 'paid' ? 'paid' : 'created',
    notes: { stripe_session_id: session.id, provider: 'stripe' },
    created_at: nowIso(),
    updated_at: nowIso(),
  })

  if (session.payment_status === 'paid') {
    const payments = await billingPayments()
    await payments.insertOne({
      id: newId(),
      user_id: userId,
      order_id: orderId,
      razorpay_payment_id: `stripe_${session.payment_intent || session.id}`,
      status: 'captured',
      amount_paise: Math.round((session.amount_total || 0) / 100),
      method: 'card',
      created_at: nowIso(),
    })

    // Issue/update subscription
    const subs = await billingSubscriptions()
    const existing = await subs.findOne({ user_id: userId, status: 'active' })
    const now = new Date()
    const endsAt = new Date(now.getTime() + 30 * 86400000).toISOString()
    if (existing) {
      await subs.updateOne({ id: existing.id }, { $set: { ends_at: endsAt, plan_id: planId } })
    } else {
      await subs.insertOne({
        id: newId(),
        user_id: userId,
        plan_id: planId,
        status: 'active',
        started_at: nowIso(),
        ends_at: endsAt,
        created_at: nowIso(),
      })
    }
  }

  const couponId = String(session.metadata?.coupon_id || '')
  if (couponId) {
    await recordCouponRedemption(couponId, userId, orderId, planId).catch(() => {})
  }
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
    incomplete: 'active',
    trialing: 'active',
  }

  const mappedStatus = statusMap[subscription.status] || 'expired'
  const existing = await subs.findOne({ user_id: userId, status: 'active' })
  const endsAt = new Date((subscription.current_period_end || 0) * 1000).toISOString()

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
      started_at: new Date((subscription.current_period_start || 0) * 1000).toISOString(),
      ends_at: endsAt,
      created_at: nowIso(),
    })
  }
}

/** Sync an invoice.paid / invoice.payment_failed event */
export async function syncInvoiceFromStripe(invoice: Stripe.Invoice): Promise<void> {
  const subscriptionId = String(invoice.subscription || '')
  const userId = String(invoice.metadata?.user_id || '')
  if (!userId && !subscriptionId) return

  const orders = await billingOrders()
  const existingOrder = subscriptionId
    ? await orders.findOne({ razorpay_order_id: `stripe_${subscriptionId}` })
    : null

  if (!existingOrder && invoice.amount_paid > 0) {
    const orderId = newId()
    await orders.insertOne({
      id: orderId,
      user_id: userId || 'system',
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
        user_id: userId || 'system',
        order_id: orderId,
        razorpay_payment_id: `stripe_${invoice.payment_intent || invoice.id}`,
        status: 'captured',
        amount_paise: invoice.amount_paid,
        created_at: nowIso(),
      })
    }
  }
}
