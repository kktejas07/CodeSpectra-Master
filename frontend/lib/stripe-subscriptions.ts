/**
 * Stripe recurring billing helpers: Prices per plan + interval (created
 * lazily from the plan catalog), customer reuse, cancel / resume, billing
 * portal. Webhook handling lives in lib/stripe-webhook-sync.ts.
 */
import 'server-only'
import type Stripe from 'stripe'
import { getMongoDb } from '@/lib/mongodb'
import { billingOrders, billingSubscriptions } from '@/lib/db/billing'
import { getStripeClient } from '@/lib/stripe-client'
import { getAppOrigin } from '@/lib/app-origin'
import type { ResolvedPlan } from '@/lib/billing-plans'

/** Cache key for one price: interval + currency + amount (a price change makes a new Price). */
export function priceCacheKey(plan: Pick<ResolvedPlan, 'interval' | 'currency' | 'amount_paise'>): string {
  return `${plan.interval === 'year' ? 'year' : 'month'}_${plan.currency.toLowerCase()}_${plan.amount_paise}`
}

/** Stripe lookup_key for the same price, so static plans reuse their Price too. */
export function priceLookupKey(plan: Pick<ResolvedPlan, 'id' | 'interval' | 'currency' | 'amount_paise'>): string {
  return `codespectra_${plan.id}_${priceCacheKey(plan)}`.slice(0, 200)
}

/**
 * The recurring Price for exactly this resolved plan (server-side amount).
 * Admin plans cache price ids on their `plans` doc (`stripe_prices`) with the
 * product id; built-in plans are found again by lookup_key.
 */
export async function ensureStripePrice(plan: ResolvedPlan): Promise<string> {
  if (plan.kind !== 'subscription' || !plan.interval || plan.amount_paise <= 0) {
    throw new Error('Only paid monthly / annual plans have a recurring price')
  }
  const key = priceCacheKey(plan)
  const lookupKey = priceLookupKey(plan)
  const plansCol = plan.source === 'db' ? (await getMongoDb()).collection('plans') : null
  const planDoc = plansCol
    ? ((await plansCol.findOne({ plan: plan.id }, { projection: { stripe_prices: 1, stripe_product_id: 1 } })) as
        | { stripe_prices?: Record<string, string>; stripe_product_id?: string }
        | null)
    : null
  const cached = planDoc?.stripe_prices?.[key]
  if (cached) return cached

  const stripe = await getStripeClient()
  const found = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })
  let priceId = found.data[0]?.id
  let productId = planDoc?.stripe_product_id
  if (!priceId) {
    if (!productId) {
      const product = await stripe.products.create({ name: plan.name, metadata: { plan_id: plan.id } })
      productId = product.id
    }
    const price = await stripe.prices.create({
      product: productId,
      currency: plan.currency.toLowerCase(),
      unit_amount: plan.amount_paise,
      recurring: { interval: plan.interval },
      lookup_key: lookupKey,
      metadata: { plan_id: plan.id, interval: plan.interval },
    })
    priceId = price.id
  }
  if (plansCol) {
    await plansCol.updateOne(
      { plan: plan.id },
      { $set: { [`stripe_prices.${key}`]: priceId, ...(productId ? { stripe_product_id: productId } : {}) } },
    )
  }
  return priceId
}

/** The user's Stripe customer from an earlier subscription or Stripe order, if any. */
export async function findStripeCustomerId(userId: string): Promise<string | null> {
  const sub = await (await billingSubscriptions()).findOne(
    { user_id: userId, stripe_customer_id: { $exists: true, $ne: '' } } as never,
    { sort: { updated_at: -1 }, projection: { stripe_customer_id: 1 } },
  )
  if (sub?.stripe_customer_id) return sub.stripe_customer_id
  const order = await (await billingOrders()).findOne(
    { user_id: userId, stripe_customer_id: { $exists: true, $ne: '' } } as never,
    { sort: { created_at: -1 }, projection: { stripe_customer_id: 1 } },
  )
  return order?.stripe_customer_id || null
}

export async function setStripeCancelAtPeriodEnd(subscriptionId: string, cancel: boolean): Promise<void> {
  const stripe = await getStripeClient()
  await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: cancel })
}

export async function cancelStripeSubscriptionNow(subscriptionId: string): Promise<void> {
  const stripe = await getStripeClient()
  await stripe.subscriptions.cancel(subscriptionId)
}

/** Stripe-hosted page to change the card (and see invoices) for this user's customer. */
export async function createBillingPortalUrl(userId: string): Promise<string | null> {
  const customer = await findStripeCustomerId(userId)
  if (!customer) return null
  const stripe = await getStripeClient()
  const session = await stripe.billingPortal.sessions.create({
    customer,
    return_url: `${getAppOrigin()}/dashboard/billing`,
  })
  return session.url
}

const toIso = (sec: unknown): string | null =>
  typeof sec === 'number' && Number.isFinite(sec) && sec > 0 ? new Date(sec * 1000).toISOString() : null

/** Current period of a Stripe subscription (on its items since API 2025-03; legacy top-level fields as fallback). */
export function stripeSubscriptionPeriod(sub: Stripe.Subscription): { start: string; end: string } | null {
  const item = sub.items?.data?.[0] as (Stripe.SubscriptionItem & { current_period_start?: number; current_period_end?: number }) | undefined
  const legacy = sub as unknown as { current_period_start?: number; current_period_end?: number }
  const start = toIso(item?.current_period_start) ?? toIso(legacy.current_period_start)
  const end = toIso(item?.current_period_end) ?? toIso(legacy.current_period_end)
  return start && end ? { start, end } : null
}

/** Subscription id an invoice belongs to (new `parent` shape, legacy `subscription` fallback). */
export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent?.subscription_details?.subscription
  const legacy = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription
  const v = parent ?? legacy
  if (!v) return null
  return typeof v === 'string' ? v : v.id
}

export function stripeId(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null
  return typeof v === 'string' ? v : v.id
}
