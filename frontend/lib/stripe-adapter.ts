/**
 * Stripe payment gateway adapter.
 * Implements PaymentGatewayAdapter for the Stripe provider.
 */
import type Stripe from 'stripe'
import { billingOrders, billingSubscriptions, newId, nowIso } from '@/lib/db/billing'
import { cancelAtPeriodEnd, orderPlanSnapshot, resolveBillingPlan } from '@/lib/billing-plans'
import { getStripeClient, getStripeSecretKey, stripeAutoRenewEnabled } from '@/lib/stripe-client'
import { ensureStripePrice, findStripeCustomerId } from '@/lib/stripe-subscriptions'
import type { PaymentGatewayAdapter, CheckoutResult, SubscriptionResult, PaymentMethod } from './payment-service'
import type { CheckoutPlan, OrderExtras } from './payment-service'

export { getStripeSecretKey }
const getClient = getStripeClient

export class StripeAdapter implements PaymentGatewayAdapter {
  name = 'stripe' as const

  /**
   * Checkout Session for exactly the resolved plan. The order (with its plan
   * snapshot) is stored first and its id travels in the session metadata.
   * Amounts are already in the smallest currency unit (paise / cents) —
   * never divide or multiply here.
   *
   *  - Monthly / annual plans: subscription mode with a recurring Price for
   *    the plan + interval (lib/stripe-subscriptions.ts). Stripe renews it;
   *    every paid invoice activates via invoice.paid (lib/stripe-webhook-sync.ts).
   *    A coupon becomes a one-time Stripe discount on the first invoice.
   *  - Packs (one_time) and STRIPE_AUTO_RENEW=false: one-off payment mode,
   *    activated on checkout.session.completed.
   */
  async createCheckout(userId: string, email: string, planId: string, plan: CheckoutPlan, couponId?: string, extras?: OrderExtras): Promise<CheckoutResult> {
    const stripe = await getClient()
    const currency = (plan.currency || 'usd').toLowerCase()
    // Prorated plan changes / credit-paid orders are one-off payments (the period is set on the order).
    const recurring = plan.kind === 'subscription' && !!plan.interval && stripeAutoRenewEnabled() && !extras?.oneOff
    // Full (pre-coupon) price for the recurring Price, from the server catalog only.
    const listPlan = recurring ? await resolveBillingPlan(plan.id, plan.interval, plan.currency) : null
    if (recurring && (!listPlan || listPlan.mode !== 'checkout' || listPlan.amount_paise < plan.amount_paise)) {
      throw new Error('Plan price changed. Please try again.')
    }
    const priceId = recurring ? await ensureStripePrice(listPlan!) : null
    const customerId = recurring ? await findStripeCustomerId(userId) : null
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
      ...(extras?.fields ?? {}),
      status: 'created',
      notes: { provider: 'stripe', ...(recurring ? { stripe_mode: 'subscription' } : {}) },
      created_at: nowIso(),
      updated_at: nowIso(),
    })

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const meta = { order_id: orderId, user_id: userId, plan_id: planId, ...(plan.interval ? { interval: plan.interval } : {}) }
    let session: Stripe.Checkout.Session
    try {
      if (recurring) {
        const discount = listPlan!.amount_paise - plan.amount_paise
        const coupon = discount > 0
          ? await stripe.coupons.create({ amount_off: discount, currency, duration: 'once', max_redemptions: 1, name: 'Coupon', metadata: { order_id: orderId } })
          : null
        session = await stripe.checkout.sessions.create({
          mode: 'subscription',
          ...(customerId ? { customer: customerId } : { customer_email: email }),
          client_reference_id: orderId,
          line_items: [{ price: priceId!, quantity: 1 }],
          ...(coupon ? { discounts: [{ coupon: coupon.id }] } : {}),
          metadata: meta,
          subscription_data: { metadata: meta },
          success_url: `${baseUrl}/dashboard/billing?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${baseUrl}/dashboard/billing?canceled=1`,
        })
      } else session = await stripe.checkout.sessions.create({
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
        metadata: meta,
        payment_intent_data: { metadata: meta },
        success_url: `${baseUrl}/dashboard/billing?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/dashboard/billing?canceled=1`,
      })
    } catch (e) {
      await orders.updateOne({ id: orderId, status: 'created' }, { $set: { status: 'failed', updated_at: nowIso() } }).catch(() => {})
      throw e
    }

    // Admin order lists detect the gateway from the `stripe_` prefix.
    await orders.updateOne(
      { id: orderId },
      { $set: { razorpay_order_id: `stripe_${session.id}`, notes: { provider: 'stripe', stripe_session_id: session.id, ...(recurring ? { stripe_mode: 'subscription' } : {}) }, updated_at: nowIso() } },
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
    await cancelAtPeriodEnd(userId)
  }

  async listPaymentMethods(userId: string, email: string): Promise<PaymentMethod[]> {
    const stripe = await getClient()
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
    const stripe = await getClient()
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
