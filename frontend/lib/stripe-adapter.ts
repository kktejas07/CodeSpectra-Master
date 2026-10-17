/**
 * Stripe payment gateway adapter.
 * Implements PaymentGatewayAdapter for the Stripe provider.
 */
import Stripe from 'stripe'
import { billingOrders, billingPayments, billingSubscriptions, newId, nowIso } from '@/lib/db/billing'
import type { PaymentGatewayAdapter, CheckoutResult, SubscriptionResult, PaymentMethod } from './payment-service'
import type { CheckoutPlan } from './payment-service'

function getClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured')
  return new Stripe(key)
}

export class StripeAdapter implements PaymentGatewayAdapter {
  name = 'stripe' as const

  async createCheckout(userId: string, email: string, planId: string, plan: CheckoutPlan): Promise<CheckoutResult> {
    const stripe = getClient()
    const session = await stripe.checkout.sessions.create({
      mode: plan.kind === 'subscription' ? 'subscription' : 'payment',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: plan.name },
          unit_amount: plan.amount_paise,
          recurring: plan.kind === 'subscription' ? { interval: 'month' } : undefined,
        },
        quantity: 1,
      }],
      metadata: { user_id: userId, plan_id: planId },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/billing?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/billing?canceled=true`,
    })

    return {
      provider: 'stripe',
      gateway_id: session.id,
      redirect_url: session.url || undefined,
      amount_paise: plan.amount_paise,
      currency: 'usd',
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
