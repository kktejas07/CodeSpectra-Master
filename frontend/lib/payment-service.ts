/**
 * Payment Service — abstraction layer over payment gateways.
 *
 * All billing code should use this service instead of calling Razorpay or Stripe
 * directly. The service automatically selects the appropriate gateway based on
 * the user's country (inferred from billing address or account metadata).
 *
 * Usage:
 *   const ps = new PaymentService()
 *   const result = await ps.createCheckoutSession(user, 'pro_monthly')
 *
 * Adding a new gateway:
 *   1. Implement PaymentGatewayAdapter
 *   2. Add to GATEWAY_REGISTRY
 *   3. Add detection logic in selectGateway()
 */

import { isRazorpayConfigured, getRazorpay } from '@/lib/razorpay-server'
import { BILLING_PLANS, billingOrders, billingSubscriptions, newId, nowIso } from '@/lib/db/billing'

export interface CheckoutResult {
  provider: 'razorpay' | 'stripe'
  /** Razorpay order ID or Stripe session ID */
  gateway_id: string
  /** For redirect-based checkouts (Stripe) */
  redirect_url?: string
  /** For embedded checkout (Razorpay) */
  key_id?: string
  amount_paise: number
  currency: string
  plan: (typeof BILLING_PLANS)[string]
}

export interface SubscriptionResult {
  id: string
  plan_id: string
  status: string
  starts_at: string
  ends_at: string
}

export interface PaymentMethod {
  id: string
  type: string
  brand?: string | null
  last4?: string | null
  is_default: boolean
}

export interface PaymentGatewayAdapter {
  name: string
  createCheckout(userId: string, email: string, planId: string, plan: typeof BILLING_PLANS[string]): Promise<CheckoutResult>
  getSubscription(userId: string): Promise<SubscriptionResult | null>
  cancelSubscription(userId: string): Promise<void>
  listPaymentMethods(userId: string, email: string): Promise<PaymentMethod[]>
  detachPaymentMethod(methodId: string): Promise<void>
}

// ─── Country → Gateway mapping ──────────────────────────────────────────────

const COUNTRY_GATEWAY: Record<string, 'razorpay' | 'stripe'> = {
  IN: 'razorpay',
  US: 'stripe',
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class PaymentService {
  private gateway: PaymentGatewayAdapter | null = null

  /** Detect which provider is configured and return adapter */
  private async getAdapter(): Promise<PaymentGatewayAdapter> {
    if (this.gateway) return this.gateway

    const razorpayConfigured = await isRazorpayConfigured()
    if (razorpayConfigured) {
      this.gateway = new RazorpayAdapter()
      return this.gateway
    }

    if (process.env.STRIPE_SECRET_KEY) {
      const { StripeAdapter } = await import('./stripe-adapter')
      this.gateway = new StripeAdapter()
      return this.gateway
    }

    throw new Error('No payment provider configured. Set RAZORPAY_KEY_ID or STRIPE_SECRET_KEY.')
  }

  /** Select gateway based on user's country (2-letter code, e.g. 'IN', 'US') */
  async getAdapterForCountry(countryCode?: string | null): Promise<PaymentGatewayAdapter> {
    const preferred = countryCode ? COUNTRY_GATEWAY[countryCode.toUpperCase()] : null

    if (preferred === 'razorpay') {
      const configured = await isRazorpayConfigured()
      if (configured) return new RazorpayAdapter()
    }
    if (preferred === 'stripe' && process.env.STRIPE_SECRET_KEY) {
      const { StripeAdapter } = await import('./stripe-adapter')
      return new StripeAdapter()
    }

    return this.getAdapter()
  }

  async createCheckout(
    userId: string,
    email: string,
    planId: string,
    countryCode?: string | null,
  ): Promise<CheckoutResult> {
    const plan = BILLING_PLANS[planId]
    if (!plan) throw new Error(`Unknown plan: ${planId}`)
    const adapter = await this.getAdapterForCountry(countryCode)
    return adapter.createCheckout(userId, email, planId, plan)
  }

  async getSubscription(userId: string): Promise<SubscriptionResult | null> {
    const adapter = await this.getAdapter()
    return adapter.getSubscription(userId)
  }

  async cancelSubscription(userId: string): Promise<void> {
    const adapter = await this.getAdapter()
    return adapter.cancelSubscription(userId)
  }

  async listPaymentMethods(userId: string, email: string): Promise<PaymentMethod[]> {
    const adapter = await this.getAdapter()
    return adapter.listPaymentMethods(userId, email)
  }

  async detachPaymentMethod(methodId: string): Promise<void> {
    const adapter = await this.getAdapter()
    return adapter.detachPaymentMethod(methodId)
  }
}

// ─── Razorpay Adapter ────────────────────────────────────────────────────────

class RazorpayAdapter implements PaymentGatewayAdapter {
  name = 'razorpay' as const

  async createCheckout(userId: string, _email: string, planId: string, plan: typeof BILLING_PLANS[string]): Promise<CheckoutResult> {
    const rp = await getRazorpay()
    const receipt = `${userId}_${planId}_${Date.now()}`
    const order = await rp.orders.create({
      amount: plan.amount_paise,
      currency: plan.currency,
      receipt,
      notes: { user_id: userId, plan_id: planId },
    })

    const orders = await billingOrders()
    await orders.insertOne({
      id: newId(),
      user_id: userId,
      razorpay_order_id: order.id,
      amount_paise: plan.amount_paise,
      currency: plan.currency,
      plan_id: planId,
      receipt,
      status: 'created',
      created_at: nowIso(),
      updated_at: nowIso(),
    })

    return {
      provider: 'razorpay',
      gateway_id: order.id,
      key_id: process.env.RAZORPAY_KEY_ID || '',
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

  async listPaymentMethods(_userId: string, _email: string): Promise<PaymentMethod[]> {
    return [{ id: 'razorpay', type: 'gateway', is_default: true }]
  }

  async detachPaymentMethod(_methodId: string): Promise<void> {
    // Razorpay uses cards endpoint; best-effort
  }
}

export { RazorpayAdapter }
