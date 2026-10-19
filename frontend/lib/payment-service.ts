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

import { isRazorpayConfigured, getRazorpay, getPublishableKeyId } from '@/lib/razorpay-server'
import { isPhonePeConfiguredAsync, createPhonePePayment } from '@/lib/phonepe-server'
import { getAppOrigin } from '@/lib/app-origin'
import { billingOrders, billingSubscriptions, newId, nowIso, type BillingOrderDoc } from '@/lib/db/billing'
import { activatePaidOrder, cancelAtPeriodEnd, orderPlanSnapshot, resolveBillingPlan, type ResolvedPlan } from '@/lib/billing-plans'
import type { PlanInterval } from '@/lib/billing-plan-mode'

export type PaymentProvider = 'razorpay' | 'stripe' | 'phonepe'

/** A priced plan as resolved by lib/billing-plans.ts (amount after coupon). */
export type CheckoutPlan = ResolvedPlan

/** Expected checkout refusals with a user-safe message. */
export class CheckoutError extends Error {
  constructor(public code: 'unknown_plan' | 'free_plan' | 'contact_sales' | 'coupon_unavailable', message: string) {
    super(message)
  }
}

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
  plan: CheckoutPlan
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
  createCheckout(userId: string, email: string, planId: string, plan: CheckoutPlan, couponId?: string): Promise<CheckoutResult>
  getSubscription(userId: string): Promise<SubscriptionResult | null>
  cancelSubscription(userId: string): Promise<void>
  listPaymentMethods(userId: string, email: string): Promise<PaymentMethod[]>
  /** Ownership-bound: implementations must verify the method belongs to this user before detaching. */
  detachPaymentMethod(userId: string, email: string, methodId: string): Promise<void>
}

// ─── Gateway selection ──────────────────────────────────────────────────────

/**
 * Pure gateway preference for a checkout (D17). INR plans prefer the Indian
 * gateways (PhonePe only when explicitly enabled — see lib/phonepe-server.ts),
 * every other currency or a non-Indian buyer prefers Stripe. Falls back to any
 * configured gateway that can take the currency (PhonePe is INR-only).
 */
export function gatewayPreference(currency: string, countryCode?: string | null): PaymentProvider[] {
  const cur = (currency || '').toUpperCase()
  const country = (countryCode || '').toUpperCase()
  if (cur !== 'INR') return ['stripe', 'razorpay']
  if (country && country !== 'IN') return ['stripe', 'razorpay', 'phonepe']
  return ['phonepe', 'razorpay', 'stripe']
}

async function isConfigured(p: PaymentProvider): Promise<boolean> {
  if (p === 'phonepe') return isPhonePeConfiguredAsync()
  if (p === 'razorpay') return isRazorpayConfigured()
  const { getStripeSecretKey } = await import('./stripe-adapter')
  return !!(await getStripeSecretKey())
}

async function adapterFor(p: PaymentProvider): Promise<PaymentGatewayAdapter> {
  if (p === 'phonepe') return new PhonePeAdapter()
  if (p === 'razorpay') return new RazorpayAdapter()
  const { StripeAdapter } = await import('./stripe-adapter')
  return new StripeAdapter()
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class PaymentService {
  private gateway: PaymentGatewayAdapter | null = null

  /** First configured gateway (for saved-method listing). */
  private async getAdapter(): Promise<PaymentGatewayAdapter> {
    if (this.gateway) return this.gateway
    for (const p of ['razorpay', 'stripe', 'phonepe'] as PaymentProvider[]) {
      if (await isConfigured(p)) {
        this.gateway = await adapterFor(p)
        return this.gateway
      }
    }
    throw new Error('No payment provider configured. Set PHONEPE, RAZORPAY, or STRIPE credentials.')
  }

  /** Gateway for a checkout in `currency`, optionally for a buyer in `countryCode`. */
  async getAdapterForCheckout(currency: string, countryCode?: string | null): Promise<PaymentGatewayAdapter> {
    for (const p of gatewayPreference(currency, countryCode)) {
      if (await isConfigured(p)) return adapterFor(p)
    }
    throw new Error('No payment provider configured. Set PHONEPE, RAZORPAY, or STRIPE credentials.')
  }

  /** @deprecated use getAdapterForCheckout (kept for tests): INR for IN, else USD. */
  async getAdapterForCountry(countryCode?: string | null): Promise<PaymentGatewayAdapter> {
    const c = (countryCode || '').toUpperCase()
    return this.getAdapterForCheckout(c && c !== 'IN' ? 'USD' : 'INR', c || null)
  }

  /**
   * Create a checkout for exactly the plan asked for. Free and contact-sales
   * plans never reach a gateway (see lib/billing-plan-mode.ts). The plan
   * snapshot (id, name, kind, duration, amount) is stored on the order so the
   * verified payment activates exactly that plan.
   */
  async createCheckout(
    userId: string,
    email: string,
    planId: string,
    countryCode?: string | null,
    couponId?: string,
    interval: PlanInterval = 'month',
  ): Promise<CheckoutResult> {
    const resolved = await resolveBillingPlan(planId, interval)
    if (!resolved) throw new CheckoutError('unknown_plan', 'That plan is not available.')
    if (resolved.mode === 'free') throw new CheckoutError('free_plan', 'The free plan does not need checkout.')
    if (resolved.mode === 'contact_sales') throw new CheckoutError('contact_sales', 'Contact sales to set up this plan.')
    let plan: CheckoutPlan = resolved

    if (couponId) {
      const { billingCoupons, reserveCouponUse } = await import('@/lib/db/billing')
      const { calculateDiscount } = await import('@/lib/coupon-service')
      const coupons = await billingCoupons()
      const coupon = await coupons.findOne({ id: couponId })
      if (!coupon) throw new CheckoutError('coupon_unavailable', 'That coupon is no longer available.')
      // CORE-018: a flat coupon only applies to orders in its own currency; seller coupons never apply to plans.
      const { couponUsableFor } = await import('@/lib/billing/coupon-rules')
      const usable = couponUsableFor(coupon, 'plans', plan.currency)
      if (!usable.ok) throw new CheckoutError('coupon_unavailable', usable.error)
      // Atomic: counts against max_uses now, one per user (D20).
      if (!(await reserveCouponUse(couponId, userId))) {
        throw new CheckoutError('coupon_unavailable', 'That coupon is no longer available.')
      }
      plan = { ...plan, amount_paise: calculateDiscount(plan.amount_paise, coupon, plan.currency) }
    }

    if (plan.amount_paise <= 0) {
      // 100% discount: no gateway. Claim the coupon reservation atomically so
      // two parallel requests can't both activate, then record a paid
      // zero-amount order and activate it.
      const orderId = newId()
      if (couponId) {
        const { finalizeCouponRedemption } = await import('@/lib/db/billing')
        if (!(await finalizeCouponRedemption(couponId, userId, orderId, plan.id))) {
          throw new CheckoutError('coupon_unavailable', 'You have already used this coupon code.')
        }
      }
      const order: BillingOrderDoc = {
        id: orderId,
        user_id: userId,
        amount_paise: 0,
        currency: plan.currency,
        ...orderPlanSnapshot(plan),
        receipt: `${userId}_${plan.id}_${Date.now()}`,
        coupon_id: couponId,
        status: 'paid',
        created_at: nowIso(),
        updated_at: nowIso(),
      }
      await (await billingOrders()).insertOne(order)
      await activatePaidOrder(order)

      return {
        provider: 'stripe', // Placeholder
        gateway_id: 'free_' + order.id,
        redirect_url: '/dashboard/pricing?payment=free&status=success',
        amount_paise: 0,
        currency: plan.currency,
        plan,
      }
    }

    const adapter = await this.getAdapterForCheckout(plan.currency, countryCode)
    return adapter.createCheckout(userId, email, plan.id, plan, couponId)
  }

  async getSubscription(userId: string): Promise<SubscriptionResult | null> {
    const adapter = await this.getAdapter()
    return adapter.getSubscription(userId)
  }

  /** DB-only (no gateway needed), so it works for coupon-only users too. */
  async cancelSubscription(userId: string): Promise<void> {
    await cancelAtPeriodEnd(userId)
  }

  async listPaymentMethods(userId: string, email: string): Promise<PaymentMethod[]> {
    const adapter = await this.getAdapter()
    return adapter.listPaymentMethods(userId, email)
  }

  async detachPaymentMethod(userId: string, email: string, methodId: string): Promise<void> {
    const adapter = await this.getAdapter()
    return adapter.detachPaymentMethod(userId, email, methodId)
  }
}

// ─── PhonePe Adapter ────────────────────────────────────────────────────────

class PhonePeAdapter implements PaymentGatewayAdapter {
  name = 'phonepe' as const

  // NEEDS A SANDBOX TEST (PhonePe PG v1) — see lib/phonepe-server.ts.
  async createCheckout(userId: string, _email: string, planId: string, plan: CheckoutPlan, couponId?: string): Promise<CheckoutResult> {
    const baseUrl = getAppOrigin()
    const receipt = `${userId}_${planId}_${Date.now()}`
    // ≤35 chars, [A-Za-z0-9_-] (PhonePe merchantTransactionId rules).
    const merchantTransactionId = `T${Date.now()}${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
    // Browser comes back here; the route re-checks status server-side.
    const redirectUrl = `${baseUrl}/api/billing/phonepe-callback?txn=${merchantTransactionId}`
    // S2S callback (checksum-verified).
    const callbackUrl = `${baseUrl}/api/billing/phonepe-webhook`

    const orders = await billingOrders()
    const orderId = newId()
    await orders.insertOne({
      id: orderId,
      user_id: userId,
      phonepe_transaction_id: merchantTransactionId,
      amount_paise: plan.amount_paise,
      currency: plan.currency,
      ...orderPlanSnapshot(plan),
      receipt,
      coupon_id: couponId,
      status: 'created',
      created_at: nowIso(),
      updated_at: nowIso(),
    })

    let payUrl: string
    try {
      ;({ payUrl } = await createPhonePePayment({
        merchantTransactionId,
        amount: plan.amount_paise,
        userId,
        redirectUrl,
        callbackUrl,
      }))
    } catch (e) {
      await orders.updateOne({ id: orderId, status: 'created' }, { $set: { status: 'failed', updated_at: nowIso() } }).catch(() => {})
      throw e
    }

    return {
      provider: 'phonepe',
      gateway_id: merchantTransactionId,
      redirect_url: payUrl,
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

  async listPaymentMethods(_userId: string, _email: string): Promise<PaymentMethod[]> {
    return [{ id: 'phonepe', type: 'gateway', is_default: true }]
  }

  async detachPaymentMethod(_userId: string, _email: string, _methodId: string): Promise<void> {
    // PhonePe doesn't have saved payment methods in the same way
  }
}

// ─── Razorpay Adapter ────────────────────────────────────────────────────────

class RazorpayAdapter implements PaymentGatewayAdapter {
  name = 'razorpay' as const

  async createCheckout(userId: string, _email: string, planId: string, plan: CheckoutPlan, couponId?: string): Promise<CheckoutResult> {
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
      ...orderPlanSnapshot(plan),
      receipt,
      coupon_id: couponId,
      status: 'created',
      created_at: nowIso(),
      updated_at: nowIso(),
    })

    return {
      provider: 'razorpay',
      gateway_id: order.id,
      // Keys may live in Mongo platform_settings (admin UI), not just env.
      key_id: (await getPublishableKeyId()) || '',
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

  async listPaymentMethods(_userId: string, _email: string): Promise<PaymentMethod[]> {
    return [{ id: 'razorpay', type: 'gateway', is_default: true }]
  }

  async detachPaymentMethod(_userId: string, _email: string, _methodId: string): Promise<void> {
    // Razorpay uses cards endpoint; best-effort
  }
}

export { RazorpayAdapter }
