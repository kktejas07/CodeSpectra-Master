/**
 * Upgrade / cycle change for a live subscription (server). Maths in ./proration.ts.
 *
 *  - Stripe subscriptions: Stripe prorates (always_invoice) and the invoice.paid
 *    webhook activates the new plan (lib/stripe-webhook-sync.ts).
 *  - Prepaid and Razorpay subscriptions: a one-off order for the prorated amount;
 *    a same-cycle upgrade keeps the period end, a longer cycle starts a new period
 *    with the unused time as credit. A Razorpay subscription then renews at the
 *    new plan's price (switched at cycle end when the order is paid).
 *  - Downgrades take effect at renewal (never refunded mid-period).
 */
import 'server-only'
import { billingOrders, billingSubscriptions, type BillingSubscriptionDoc } from '@/lib/db/billing'
import { resolveBillingPlan, type ResolvedPlan } from '@/lib/billing-plans'
import type { PlanInterval } from '@/lib/billing-plan-mode'
import { prorationQuote, type ProrationQuote } from './proration'

export interface ChangeContext {
  sub: BillingSubscriptionDoc
  target: ResolvedPlan
  quote: ProrationQuote
}

export type ChangeError = 'no_subscription' | 'unknown_plan' | 'not_purchasable' | 'currency_mismatch' | 'period_over' | 'invalid'

export async function planChangeContext(userId: string, planId: string, interval: PlanInterval, now = new Date()): Promise<{ ok: true; ctx: ChangeContext } | { ok: false; code: ChangeError }> {
  const sub = await (await billingSubscriptions()).findOne({ user_id: userId, status: 'active', ends_at: { $gt: now.toISOString() } }, { sort: { ends_at: -1 }, projection: { _id: 0 } })
  if (!sub) return { ok: false, code: 'no_subscription' }
  const funding = sub.last_order_id ? await (await billingOrders()).findOne({ id: sub.last_order_id, user_id: userId }, { projection: { _id: 0 } }) : null
  const currency = funding?.currency || 'INR'
  const target = await resolveBillingPlan(planId, interval, currency)
  if (!target) return { ok: false, code: 'unknown_plan' }
  if (target.mode !== 'checkout' || target.kind !== 'subscription') return { ok: false, code: 'not_purchasable' }
  const currentInterval = funding?.interval ?? (sub.ends_at && Date.parse(sub.ends_at) - Date.parse(sub.started_at) > 100 * 86_400_000 ? 'year' : 'month')
  // Value the current period at what was actually paid for it (0 for trials / 100 %-off orders).
  const quote = prorationQuote({
    currentAmount: funding?.amount_paise ?? 0,
    currentStart: funding?.period_start || sub.started_at,
    currentEnd: sub.ends_at,
    currentInterval,
    currentCurrency: currency,
    newAmount: target.amount_paise,
    newInterval: interval,
    newCurrency: target.currency,
    samePlan: sub.plan_id === target.id,
    now,
  })
  if (!quote.ok) return { ok: false, code: quote.reason }
  return { ok: true, ctx: { sub, target, quote } }
}

/** Stripe: swap the subscription's price with immediate prorated invoicing. */
export async function changeStripePlan(sub: BillingSubscriptionDoc, target: ResolvedPlan): Promise<void> {
  const { getStripeClient } = await import('@/lib/stripe-client')
  const { ensureStripePrice } = await import('@/lib/stripe-subscriptions')
  const stripe = await getStripeClient()
  const current = await stripe.subscriptions.retrieve(sub.stripe_subscription_id!)
  const item = current.items.data[0]
  if (!item) throw new Error('Stripe subscription has no items')
  const price = await ensureStripePrice(target)
  await stripe.subscriptions.update(sub.stripe_subscription_id!, {
    items: [{ id: item.id, price }],
    proration_behavior: 'always_invoice',
    payment_behavior: 'error_if_incomplete',
    cancel_at_period_end: false,
    metadata: { ...(current.metadata || {}), plan_id: target.id, interval: String(target.interval) },
  })
}
