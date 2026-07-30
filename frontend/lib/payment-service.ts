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
import { isPhonePeConfiguredAsync, createPhonePeOrder, getPhonePeMerchantId } from '@/lib/phonepe-server'
import { BILLING_PLANS, billingOrders, billingSubscriptions, newId, nowIso } from '@/lib/db/billing'

export type PaymentProvider = 'razorpay' | 'stripe' | 'phonepe'

export interface CheckoutResult {
  provider: PaymentProvider
  /** Provider order/checkout ID */
  gateway_id: string
  /** For redirect-based checkouts (Stripe, PhonePe) */
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
  name: PaymentProvider
  createCheckout(userId: string, email: string, planId: string, plan: typeof BILLING_PLANS[string], couponId?: string): Promise<CheckoutResult>
  getSubscription(userId: string): Promise<SubscriptionResult | null>
  cancelSubscription(userId: string): Promise<void>
  listPaymentMethods(userId: string, email: string): Promise<PaymentMethod[]>
  detachPaymentMethod(methodId: string): Promise<void>
}

// ─── Country → Gateway mapping ──────────────────────────────────────────────

const COUNTRY_GATEWAY: Record<string, PaymentProvider> = {
  IN: 'phonepe',  // PhonePe first for India
  US: 'stripe',
}

const PROVIDER_ORDER: PaymentProvider[] = ['phonepe', 'razorpay', 'stripe']

// ─── Service ─────────────────────────────────────────────────────────────────

export class PaymentService {
  private gateway: PaymentGatewayAdapter | null = null

  /** Detect which provider is configured and return adapter */
  private async getAdapter(): Promise<PaymentGatewayAdapter> {
    if (this.gateway) return this.gateway

    // Try in order of preference
    for (const provider of PROVIDER_ORDER) {
      if (provider === 'phonepe' && await isPhonePeConfiguredAsync()) {
        this.gateway = new PhonePeAdapter()
        return this.gateway
      }
      if (provider === 'razorpay' && await isRazorpayConfigured()) {
        this.gateway = new RazorpayAdapter()
        return this.gateway
      }
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY
    if (stripeKey) {
      const { StripeAdapter } = await import('./stripe-adapter')
      this.gateway = new StripeAdapter()
      return this.gateway
    }

    throw new Error('No payment provider configured. Set PHONEPE, RAZORPAY, or STRIPE credentials.')
  }

  /** Select gateway based on user's country (2-letter code, e.g. 'IN', 'US') */
  async getAdapterForCountry(countryCode?: string | null): Promise<PaymentGatewayAdapter> {
    const preferred = countryCode ? COUNTRY_GATEWAY[countryCode.toUpperCase()] : null

    if (preferred === 'phonepe' && await isPhonePeConfiguredAsync()) {
      return new PhonePeAdapter()
    }
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
    couponId?: string,
  ): Promise<CheckoutResult> {
    // Map pricing-catalog plan IDs (free/pro/enterprise) to billing-plan keys
    const PLAN_ID_MAP: Record<string, string> = {
      free: 'pro_monthly', pro: 'pro_monthly', enterprise: 'pro_monthly',
    }
    const resolvedPlanId = PLAN_ID_MAP[planId] || planId
    let plan = BILLING_PLANS[resolvedPlanId]
    if (!plan) {
      try {
        const { getMongoDb } = await import('@/lib/mongodb')
        const db = await getMongoDb()
        const dbPlan = await db.collection('plans').findOne({ $or: [{ plan: planId }, { id: planId }] })
        if (dbPlan) {
          let usd = 29
          if (typeof dbPlan.price === 'number') usd = dbPlan.price
          else if (typeof dbPlan.price === 'string') {
            const m = dbPlan.price.match(/[\d.]+/)
            if (m) usd = parseFloat(m[0])
          }
          const amount_paise = dbPlan.amount_paise || Math.round(usd * 83 * 100)
          plan = {
            id: planId,
            name: dbPlan.name || planId,
            amount_paise,
            currency: dbPlan.currency || 'INR',
            kind: 'subscription' as const,
            duration_days: 30,
            perks: Array.isArray(dbPlan.features) ? dbPlan.features.map((f: any) => typeof f === 'string' ? f : f.label || '') : [],
          }
        }
      } catch (e) {
        console.warn('[CodeSpectra] Could not look up dynamic plan from DB:', e)
      }
    }
    if (!plan) throw new Error(`Unknown plan: ${resolvedPlanId}`)

    if (couponId) {
      const { billingCoupons } = await import('@/lib/db/billing')
      const { calculateDiscount } = await import('@/lib/coupon-service')
      const coupons = await billingCoupons()
      const coupon = await coupons.findOne({ id: couponId })
      if (coupon) {
        plan = { ...plan, amount_paise: calculateDiscount(plan.amount_paise, coupon) }
      }
    }

    if (plan.amount_paise === 0) {
      // 100% discount, bypass gateway and immediately activate subscription
      const { billingSubscriptions, billingOrders, nowIso, newId, recordCouponRedemption } = await import('@/lib/db/billing')
      const subs = await billingSubscriptions()
      const existing = await subs.findOne({ user_id: userId, status: 'active' })
      const startsAt = nowIso()
      const endsAt = new Date(Date.now() + (plan.duration_days || 30) * 86400000).toISOString()

      const orders = await billingOrders()
      const receipt = `${userId}_${resolvedPlanId}_${Date.now()}`
      await orders.insertOne({
        id: newId(),
        user_id: userId,
        amount_paise: 0,
        currency: plan.currency,
        plan_id: resolvedPlanId,
        receipt,
        coupon_id: couponId,
        status: 'paid', // immediately paid
        created_at: nowIso(),
        updated_at: nowIso(),
      })

      if (existing) {
        await subs.updateOne(
          { _id: existing._id },
          { $set: { plan_id: resolvedPlanId, ends_at: endsAt, updated_at: nowIso() } }
        )
      } else {
        await subs.insertOne({
          id: newId(),
          user_id: userId,
          plan_id: resolvedPlanId,
          status: 'active',
          started_at: startsAt,
          ends_at: endsAt,
          created_at: nowIso(),
          updated_at: nowIso(),
        } as any)
      }

      if (couponId) {
        await recordCouponRedemption(couponId, userId, undefined, resolvedPlanId).catch(() => {})
      }

      return {
        provider: 'stripe', // Placeholder
        gateway_id: 'free_' + Date.now(),
        redirect_url: '/dashboard/pricing?payment=free&status=success',
        amount_paise: 0,
        currency: plan.currency,
        plan
      }
    }

    const adapter = await this.getAdapterForCountry(countryCode)
    return adapter.createCheckout(userId, email, resolvedPlanId, plan, couponId)
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

// ─── PhonePe Adapter ────────────────────────────────────────────────────────

class PhonePeAdapter implements PaymentGatewayAdapter {
  name = 'phonepe' as const

  async createCheckout(userId: string, email: string, planId: string, plan: typeof BILLING_PLANS[string], couponId?: string): Promise<CheckoutResult> {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const callbackUrl = `${baseUrl}/api/billing/phonepe-callback`
    const redirectUrl = `${baseUrl}/dashboard/billing?payment=phonepe&status=success`

    const receipt = `${userId}_${planId}_${Date.now()}`

    // Use a simple transaction ID format for PhonePe
    const merchantTransactionId = `TXN_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    const orderResponse = await createPhonePeOrder({
      merchantTransactionId,
      amount: plan.amount_paise,
      userId,
      email,
      callbackUrl,
      redirectUrl,
    })

    if (!orderResponse.success || !orderResponse.data?.instrumentResponse?.intentUrl) {
      throw new Error(orderResponse.message || 'PhonePe order creation failed')
    }

    const orders = await billingOrders()
    await orders.insertOne({
      id: newId(),
      user_id: userId,
      phonepe_transaction_id: merchantTransactionId,
      amount_paise: plan.amount_paise,
      currency: plan.currency,
      plan_id: planId,
      receipt,
      coupon_id: couponId,
      status: 'created',
      created_at: nowIso(),
      updated_at: nowIso(),
    })

    return {
      provider: 'phonepe',
      gateway_id: merchantTransactionId,
      redirect_url: orderResponse.data.instrumentResponse.intentUrl,
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
    return [{ id: 'phonepe', type: 'gateway', is_default: true }]
  }

  async detachPaymentMethod(_methodId: string): Promise<void> {
    // PhonePe doesn't have saved payment methods in the same way
  }
}

// ─── Razorpay Adapter ────────────────────────────────────────────────────────

class RazorpayAdapter implements PaymentGatewayAdapter {
  name = 'razorpay' as const

  async createCheckout(userId: string, _email: string, planId: string, plan: typeof BILLING_PLANS[string], couponId?: string): Promise<CheckoutResult> {
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
      coupon_id: couponId,
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
