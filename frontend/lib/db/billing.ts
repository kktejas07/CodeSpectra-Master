/**
 * Billing repositories: orders, payments, subscriptions.
 *
 * Collections:
 *   - billing_orders   : { id, user_id, razorpay_order_id, amount_paise, currency,
 *                          plan_id, receipt, status, created_at, updated_at }
 *   - billing_payments : { id, user_id, order_id, razorpay_payment_id, signature,
 *                          status:'captured'|'failed'|'refunded', amount_paise, created_at }
 *   - billing_subscriptions : { id, user_id, plan_id, status, started_at, ends_at }
 */
import { newId, nowIso } from './ids'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

export { newId, nowIso }

export interface BillingOrderDoc {
  id: string
  user_id: string
  razorpay_order_id?: string
  phonepe_transaction_id?: string
  amount_paise: number
  currency: string
  plan_id: string
  receipt: string
  status: 'created' | 'attempted' | 'paid' | 'failed' | 'refunded'
  notes?: Record<string, string>
  coupon_id?: string
  /** Plan snapshot taken at checkout (lib/billing-plans.ts) so activation uses exactly what was paid for. */
  plan_name?: string
  plan_kind?: 'one_time' | 'subscription' | 'licence'
  duration_days?: number
  interval?: 'month' | 'year'
  /** Window this order funded on the subscription (set on activation). */
  subscription_id?: string
  period_start?: string
  period_end?: string
  /** Manual refund record (admin "Mark as refunded"). */
  refunded_at?: string
  refunded_by?: string
  refunded_by_email?: string
  refund_note?: string
  /** Stripe recurring billing: the invoice this order records (unique — one activation per invoice). */
  stripe_invoice_id?: string
  stripe_subscription_id?: string
  stripe_customer_id?: string
  /** Razorpay recurring billing: the subscription, and the payment id of the charge this order records (unique). */
  razorpay_subscription_id?: string
  razorpay_charge_id?: string
  /** Licence orders: the organisation (tenant) and the licence they fund. */
  org_id?: string
  licence_id?: string
  licence_seats?: number
  /** Plan change: credit for the unused period applied, and the change kind (lib/billing/proration.ts). */
  proration_credit?: number
  proration_kind?: 'upgrade_same_cycle' | 'new_period_with_credit'
  /** Keep this end date (same-cycle upgrade). */
  keep_period_end?: string
  /** Salted hash of the buyer's IP at checkout (referral abuse checks only). */
  checkout_ip_hash?: string
  /** Referral / account credit applied to this order (minor units). */
  credit_applied?: number
  /** Sequential GST invoice number + tax snapshot (lib/billing/tax-invoice.ts). */
  invoice_number?: string
  invoice_tax?: Record<string, unknown>
  created_at: string
  updated_at: string
}
export interface BillingPaymentDoc {
  id: string
  user_id: string
  order_id: string
  razorpay_payment_id: string
  phonepe_payment_id?: string
  signature?: string
  status: 'captured' | 'failed' | 'refunded' | 'authorized'
  amount_paise: number
  method?: string
  created_at: string
  raw_event?: Record<string, unknown>
}
export interface BillingSubscriptionDoc {
  id: string
  user_id: string
  plan_id: string
  status: 'active' | 'cancelled' | 'expired' | 'past_due'
  started_at: string
  ends_at: string
  last_payment_id?: string
  last_order_id?: string
  trial_ends_at?: string
  /** Order that funded the trial window; the trial-expiry job only ends that period. */
  trial_order_id?: string
  /** User cancelled: access continues until ends_at, then the plan simply lapses. */
  cancel_at_period_end?: boolean
  cancelled_at?: string
  /** 'stripe_subscription' = Stripe renews it automatically; otherwise a prepaid period. */
  billing_mode?: 'prepaid' | 'stripe_subscription' | 'razorpay_subscription'
  /** Razorpay subscription id (billing_mode razorpay_subscription). */
  razorpay_subscription_id?: string
  /** CORE-036: free days (referral reward) added to every Razorpay period end — lib/billing/gateway-bonus.ts. */
  gateway_bonus_days?: number
  stripe_customer_id?: string
  stripe_subscription_id?: string
  /** A renewal payment failed: access continues until grace_ends_at (= ends_at), then lapses. */
  past_due?: boolean
  past_due_since?: string
  grace_ends_at?: string
  /** Why the subscription stopped (Stripe ended it, grace ran out, …). */
  ended_reason?: string
  created_at: string
  updated_at?: string
}

/**
 * A one-time problem pack (catalog entry). Its id is the checkout plan id and
 * the value stored in user.purchased_packs. Problems belong to a pack by slug
 * or by topic. Purchases never expire.
 */
export interface ProblemPackDoc {
  id: string
  name: string
  description?: string
  /** Major units of `currency` (e.g. 199 = ₹199). */
  price: number
  currency: string
  problem_slugs: string[]
  topics: string[]
  /** Plan keys whose subscribers get the pack without buying it (e.g. pro). */
  included_in_plans: string[]
  /** On sale. A pack that is not on sale still locks its problems; buyers keep access. */
  active: boolean
  created_at?: string
  updated_at?: string
}

export interface BillingCouponDoc {
  id: string
  code: string
  discount_type: 'percentage' | 'flat' | 'trial'
  discount_value: number
  max_uses: number
  current_uses: number
  valid_until?: string
  active: boolean
  trial_duration_days?: number
  /** Flat coupons: the currency `discount_value` is in (CORE-018). Missing on legacy coupons = INR. */
  currency?: 'INR' | 'USD'
  /** Set when a legacy flat coupon was given INR by the migration; cleared once an admin saves it. */
  currency_migrated_at?: string | null
  /** Where it can be used (default all). Seller coupons are always marketplace-only. */
  applies_to?: 'all' | 'plans' | 'marketplace'
  /** Platform coupons on third-party marketplace items (CORE-021). Default platform_items_only. */
  marketplace_funding?: 'platform_items_only' | 'platform_funded'
  /** Seller coupon: created by this marketplace seller, only for their items, seller-funded. */
  seller_id?: string | null
  /** Plan restrictions (lib/billing/coupon-eligibility.ts). */
  per_user_limit?: number
  plan_ids?: string[]
  first_purchase_only?: boolean
  starts_at?: string | null
  /** SEC-035 / CORE-049: personal coupon — only this user may redeem it (lib/billing/coupon-eligibility.ts). */
  user_id?: string | null
  created_at: string
  created_by?: string
  redemptions?: Array<{ user_id: string; user_name?: string; user_email?: string; order_id?: string | null; plan_id?: string | null; redeemed_at: string; status?: 'reserved' | 'redeemed' }>
}

export async function billingOrders(): Promise<Collection<BillingOrderDoc>> {
  return (await getMongoDb()).collection<BillingOrderDoc>('billing_orders')
}
export async function billingPayments(): Promise<Collection<BillingPaymentDoc>> {
  return (await getMongoDb()).collection<BillingPaymentDoc>('billing_payments')
}
export async function billingSubscriptions(): Promise<Collection<BillingSubscriptionDoc>> {
  return (await getMongoDb()).collection<BillingSubscriptionDoc>('billing_subscriptions')
}
export async function billingCoupons(): Promise<Collection<BillingCouponDoc>> {
  return (await getMongoDb()).collection<BillingCouponDoc>('billing_coupons')
}
export async function billingPacks(): Promise<Collection<ProblemPackDoc>> {
  return (await getMongoDb()).collection<ProblemPackDoc>('billing_packs')
}

/**
 * Built-in packs. A `billing_packs` doc with the same id overrides it (admin
 * assigns problems in /dashboard/admin/plans). Empty by default: a pack locks
 * nothing until problems are assigned to it.
 */
export const DEFAULT_PROBLEM_PACKS: ProblemPackDoc[] = [
  {
    id: 'problem_pack_50',
    name: '50 Premium Problem Pack',
    description: '50 expert-curated premium problems. Lifetime access.',
    price: 199,
    currency: 'INR',
    problem_slugs: [],
    topics: [],
    included_in_plans: ['pro', 'enterprise'],
    active: true,
  },
]

async function redeemerInfo(userId: string): Promise<{ user_name?: string; user_email?: string }> {
  try {
    const db = await getMongoDb()
    const u = await db.collection('user').findOne(
      { $or: [{ id: userId }, { _id: userId }] } as any,
      { projection: { name: 1, fullName: 1, email: 1 } },
    ) as { name?: string; fullName?: string; email?: string } | null
    if (u) return { user_name: u.fullName || u.name || '', user_email: u.email || '' }
  } catch { /* best effort */ }
  return {}
}

/**
 * Atomically reserve one use of a coupon for this user at checkout (D20):
 * counts against max_uses immediately and allows one reservation per user.
 *
 * With `orderId` (marketplace) the reservation is bound to that order: only a
 * retry for the SAME order reuses it, so two open checkouts can't both carry
 * the discount. It is released (releaseCouponReservation) when that order is
 * abandoned / fails. Without `orderId` (plan billing) a user's own unpaid
 * reservation is reused as before.
 * Returns false when the coupon is used up or the user already holds / redeemed it.
 */
export async function reserveCouponUse(couponId: string, userId: string, orderId?: string): Promise<boolean> {
  const col = await billingCoupons()
  const reservation = { user_id: userId, status: 'reserved', redeemed_at: nowIso(), ...(orderId ? { order_id: orderId } : {}), ...(await redeemerInfo(userId)) }
  const own = orderId
    ? { user_id: userId, status: 'reserved', order_id: orderId }
    : { user_id: userId, status: 'reserved' }
  // Reuse the caller's own open reservation first (a retried checkout).
  const mine = await col.findOne({ id: couponId, active: true, redemptions: { $elemMatch: own } } as any, { projection: { _id: 1 } })
  if (mine) return true
  const res = await col.updateOne(
    {
      id: couponId,
      active: true,
      // Per-person limit (default 1): this user's reservations + redemptions so far.
      $and: [
        await perUserFilter(col, couponId, userId),
        { $or: [{ max_uses: { $lte: 0 } }, { $expr: { $lt: ['$current_uses', '$max_uses'] } }] },
      ],
    } as any,
    { $inc: { current_uses: 1 }, $push: { redemptions: reservation as any } },
  )
  return res.modifiedCount > 0
}

/**
 * Atomic per-person limit filter: one use per user (the default) is a plain
 * `$ne`; a coupon allowing more counts this user's entries in the array.
 */
async function perUserFilter(col: Collection<BillingCouponDoc>, couponId: string, userId: string): Promise<Record<string, unknown>> {
  const c = await col.findOne({ id: couponId }, { projection: { per_user_limit: 1 } })
  const limit = Number.isInteger(c?.per_user_limit) && (c!.per_user_limit as number) > 1 ? (c!.per_user_limit as number) : 1
  if (limit === 1) return { 'redemptions.user_id': { $ne: userId } }
  return { $expr: { $lt: [{ $size: { $filter: { input: { $ifNull: ['$redemptions', []] }, cond: { $eq: ['$$this.user_id', userId] } } } }, limit] } }
}

/** Give back an order-bound reservation (abandoned / failed / replaced checkout). Idempotent. */
export async function releaseCouponReservation(couponId: string, userId: string, orderId: string): Promise<boolean> {
  const col = await billingCoupons()
  const r = await col.updateOne(
    { id: couponId, redemptions: { $elemMatch: { user_id: userId, status: 'reserved', order_id: orderId } } } as any,
    { $pull: { redemptions: { user_id: userId, status: 'reserved', order_id: orderId } } as any, $inc: { current_uses: -1 } },
  )
  return r.modifiedCount > 0
}

/**
 * Turn the user's reservation into a redemption for a paid order. Atomic:
 * returns false if there was no open reservation (already redeemed), so a
 * zero-amount order can't be activated twice from two parallel requests.
 * Orders created before reservations existed fall back to push + inc.
 *
 * `strictOrder` (marketplace): only a reservation bound to THIS order counts;
 * without one, a fresh use is taken atomically only if the user holds no
 * other reservation / redemption and the coupon has uses left. false = the
 * paid order is not entitled to the discount (the caller must act on it).
 */
export async function finalizeCouponRedemption(
  couponId: string, userId: string, orderId: string, planId?: string, opts: { strictOrder?: boolean } = {},
): Promise<boolean> {
  const col = await billingCoupons()
  const mine = opts.strictOrder ? { user_id: userId, status: 'reserved', order_id: orderId } : { user_id: userId, status: 'reserved' }
  const res = await col.updateOne(
    { id: couponId, redemptions: { $elemMatch: mine } } as any,
    {
      $set: {
        'redemptions.$.status': 'redeemed',
        'redemptions.$.order_id': orderId,
        'redemptions.$.plan_id': planId ?? null,
        'redemptions.$.redeemed_at': nowIso(),
      },
    } as any,
  )
  if (res.modifiedCount > 0) return true
  const already = await col.findOne(
    { id: couponId, redemptions: { $elemMatch: { user_id: userId, order_id: orderId, status: 'redeemed' } } } as any,
    { projection: { _id: 1 } },
  )
  if (already) return !!opts.strictOrder // marketplace: idempotent re-run of the same order
  if (opts.strictOrder) {
    // Late payment after the reservation was released: take a fresh use if one is still free.
    const fresh = await col.updateOne(
      {
        id: couponId,
        $and: [
          await perUserFilter(col, couponId, userId),
          { $or: [{ max_uses: { $lte: 0 } }, { $expr: { $lt: ['$current_uses', '$max_uses'] } }] },
        ],
      } as any,
      { $inc: { current_uses: 1 }, $push: { redemptions: { user_id: userId, status: 'redeemed', order_id: orderId, plan_id: planId ?? null, redeemed_at: nowIso(), ...(await redeemerInfo(userId)) } as any } },
    )
    return fresh.modifiedCount > 0
  }
  const legacyUsed = await hasUserUsedCoupon(couponId, userId)
  if (legacyUsed) return false
  await col.updateOne(
    { id: couponId },
    {
      $inc: { current_uses: 1 },
      $push: { redemptions: { user_id: userId, status: 'redeemed', order_id: orderId, plan_id: planId ?? null, redeemed_at: nowIso(), ...(await redeemerInfo(userId)) } as any },
    },
  )
  return true
}

/** Completed redemptions of this coupon by the user (open reservations don't count). */
export async function userCouponRedemptions(couponId: string, userId: string): Promise<number> {
  const col = await billingCoupons()
  const doc = await col.findOne({ id: couponId }, { projection: { redemptions: 1 } })
  return (doc?.redemptions || []).filter((r) => r.user_id === userId && r.status !== 'reserved').length
}

/** True once the user has used up their per-person allowance (default 1) of the coupon. */
export async function hasUserUsedCoupon(couponId: string, userId: string): Promise<boolean> {
  const col = await billingCoupons()
  const doc = await col.findOne({ id: couponId }, { projection: { redemptions: 1, per_user_limit: 1 } })
  const used = (doc?.redemptions || []).filter((r) => r.user_id === userId && r.status !== 'reserved').length
  const limit = Number.isInteger(doc?.per_user_limit) && (doc!.per_user_limit as number) >= 1 ? (doc!.per_user_limit as number) : 1
  return used >= limit
}

/** Catalog of buyable plans. Amounts in paise. */
export const BILLING_PLANS: Record<
  string,
  { id: string; name: string; amount_paise: number; currency: 'INR'; kind: 'one_time' | 'subscription'; duration_days?: number; perks: string[] }
> = {
  pro_monthly: {
    id: 'pro_monthly',
    name: 'CodeSpectra Pro · Monthly',
    amount_paise: 49900, // ₹499
    currency: 'INR',
    kind: 'subscription',
    duration_days: 30,
    perks: [
      'Unlimited AI code reviews',
      'Unlimited Smart Hints',
      'Daily premium problems',
      'Advanced Skill Analytics',
      'Identity verification for hiring',
    ],
  },
  pro_yearly: {
    id: 'pro_yearly',
    name: 'CodeSpectra Pro · Yearly',
    amount_paise: 499000, // ₹4990
    currency: 'INR',
    kind: 'subscription',
    duration_days: 365,
    perks: ['Everything in Monthly', '2 months free', 'Priority AI model access'],
  },
  problem_pack_50: {
    id: 'problem_pack_50',
    name: '50 Premium Problem Pack',
    amount_paise: 19900, // ₹199
    currency: 'INR',
    kind: 'one_time',
    perks: ['50 expert-curated premium problems', 'Lifetime access'],
  },
}
