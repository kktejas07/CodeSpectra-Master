/**
 * Stripe payment gateway adapter.
 * Implements PaymentGatewayAdapter for the Stripe provider.
 */
import Stripe from 'stripe'
import { billingOrders, billingSubscriptions, newId, nowIso } from '@/lib/db/billing'
import { orderPlanSnapshot } from '@/lib/billing-plans'
import type { PaymentGatewayAdapter, CheckoutResult, SubscriptionResult, PaymentMethod } from './payment-service'
import type { CheckoutPlan } from './payment-service'

function getClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured')
  return new Stripe(key)
}

export class StripeAdapter implements PaymentGatewayAdapter {
  name = 'stripe' as const

  /**
   * One-off Checkout Session for exactly the resolved plan, like Razorpay:
   * the order (with its plan snapshot) is stored first and its id travels in
   * the session metadata, so the webhook activates that order via
   * activatePaidOrder(). Amounts are already in the smallest currency unit
   * (plan.amount_paise = paise / cents), which is what Stripe's unit_amount
   * expects — never divide or multiply here.
   *
   * ponytail: mode is always 'payment' (no Stripe-side recurring billing).
   * Subscription plans extend by duration_days per paid order, same as the
   * Razorpay / PhonePe paths; Stripe auto-renewal would need invoice-driven
   * activation, which this app doesn't implement.
   */
  async createCheckout(userId: string, email: string, planId: string, plan: CheckoutPlan, couponId?: string): Promise<CheckoutResult> {
    const stripe = getClient()
    const currency = (plan.currency || 'usd').toLowerCase()
    const orderId = newId()
    const orders = await billingOrders()
    await orders.insertOne({
      id: orderId,
      user_id: userId,
      amount_paise: plan.amount_paise,
      currency: plan.currency,
      ...orderPlanSnapshot(plan),
      receipt: `${userId}_${planId}_${Date.now()}`,
      coupon_id: couponId,
      status: 'created',
      notes: { provider: 'stripe' },
      created_at: nowIso(),
      updated_at: nowIso(),
    })

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    let session: Stripe.Checkout.Session
    try {
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        customer_email: email,
        client_reference_id: orderId,
        line_items: [{
          price_data: {
            currency,
            product_data: { name: plan.name },
            unit_amount: plan.amount_paise,
          },
          quantity: 1,
        }],
        metadata: { order_id: orderId, user_id: userId, plan_id: planId },
        payment_intent_data: { metadata: { order_id: orderId, user_id: userId, plan_id: planId } },
        success_url: `${baseUrl}/dashboard/billing?success=true`,
        cancel_url: `${baseUrl}/dashboard/billing?canceled=true`,
      })
    } catch (e) {
      await orders.updateOne({ id: orderId, status: 'created' }, { $set: { status: 'failed', updated_at: nowIso() } }).catch(() => {})
      throw e
    }

    // Admin order lists detect the gateway from the `stripe_` prefix.
    await orders.updateOne(
      { id: orderId },
      { $set: { razorpay_order_id: `stripe_${session.id}`, notes: { provider: 'stripe', stripe_session_id: session.id }, updated_at: nowIso() } },
    )

    return {
      provider: 'stripe',
      gateway_id: session.id,
      redirect_url: session.url || undefined,
      amount_paise: plan.amount_paise,
      currency: plan.currency,
      plan,
    }
  }

  async getSubscription(userId: string): Promise<SubscriptionResult | null> {
    const subs = await billingSubscriptions()
    const active = await subs.findOne({ user_id: userId, status: 'active' })
    if (!active || new Date(active.ends_at) <= new Date()) return null
    return { id: active.id, plan_id: active.plan_id, status: active.status, starts_at: active.started_at, ends_at: active.ends_at }
  }

  async cancelSubscription(userId: string): Promise<void> {
    const subs = await billingSubscriptions()
    await subs.updateOne({ user_id: userId, status: 'active' }, { $set: { status: 'cancelled' } })
  }

  async listPaymentMethods(userId: string, email: string): Promise<PaymentMethod[]> {
    const stripe = getClient()
    const customers = await stripe.customers.list({ email, limit: 1 })
    const customer = customers.data[0]
    if (!customer) return []

    const methods = await stripe.customers.listPaymentMethods(customer.id)
    return methods.data.map((pm) => ({
      id: pm.id,
      type: pm.type,
      brand: pm.card?.brand || null,
      last4: pm.card?.last4 || null,
      is_default: pm.id === customer.invoice_settings?.default_payment_method,
    }))
  }

  async detachPaymentMethod(userId: string, email: string, methodId: string): Promise<void> {
    const stripe = getClient()
    // Ownership check: the method must belong to THIS user's Stripe customer.
    const customers = await stripe.customers.list({ email, limit: 1 })
    const customer = customers.data[0]
    if (!customer) throw new Error('Payment method not found')
    const pm = await stripe.paymentMethods.retrieve(methodId)
    if (pm.customer !== customer.id) {
      throw new Error('Payment method does not belong to this account')
    }
    await stripe.paymentMethods.detach(methodId)
  }
}
