/**
 * Single source of truth for "which plan is being bought, for how much, and
 * what does a verified payment activate".
 *
 *  - resolveBillingPlan(): one resolver for the static catalogs
 *    (lib/db/billing BILLING_PLANS legacy keys, lib/billing-catalog free/pro/
 *    enterprise defaults) AND admin-created plans in the `plans` collection.
 *  - orderPlanSnapshot(): fields stored on billing_orders at checkout so the
 *    activation later uses exactly what was charged.
 *  - activatePaidOrder(): called once per order by whoever atomically claimed
 *    it (verify, Razorpay webhook, PhonePe callback/webhook, 100%-off coupon).
 *  - markOrderRefunded(): manual refund record for the admin billing screen.
 *    It never calls a gateway refund API.
 */
import 'server-only'
import { getMongoDb } from '@/lib/mongodb'
import { getPlatformCurrency } from '@/lib/server-currency'
import { BILLING_PLANS as CATALOG_DEFAULTS } from '@/lib/billing-catalog'
import {
  BILLING_PLANS as STATIC_PLANS,
  DEFAULT_PROBLEM_PACKS,
  billingCoupons,
  billingPacks,
  billingOrders,
  billingPayments,
  billingSubscriptions,
  newId,
  nowIso,
  finalizeCouponRedemption,
  type BillingOrderDoc,
  type BillingSubscriptionDoc,
  type ProblemPackDoc,
} from '@/lib/db/billing'
import {
  isValidPlanId,
  parsePlanPrice,
  planCheckoutMode,
  type PlanCheckoutMode,
  type PlanInterval,
} from '@/lib/billing-plan-mode'
import { graceExpired, trialDaysForCoupon } from '@/lib/billing-lifecycle'
import { DEFAULT_PRO_PRICES, isBillingCurrency, priceFor, type PlanPrices } from '@/lib/billing/plan-prices'
import { withGatewayBonus } from '@/lib/billing/gateway-bonus'

export interface ResolvedPlan {
  /** Canonical id stored on the order and the subscription. */
  id: string
  name: string
  /** Minor units (paise / cents) of `currency`. 0 unless mode === 'checkout'. */
  amount_paise: number
  currency: string
  kind: 'one_time' | 'subscription' | 'licence'
  duration_days?: number
  interval?: PlanInterval
  perks: string[]
  mode: PlanCheckoutMode
  source: 'static' | 'db' | 'catalog'
}

const DAY_MS = 86_400_000

function durationFor(interval: PlanInterval): number {
  return interval === 'year' ? 365 : 30
}

function toMinor(major: number): number {
  return Math.round(major * 100)
}

/**
 * Resolve a plan id (+ billing interval for monthly/annual plans) to a priced,
 * classified plan. Returns null for unknown ids. Order of precedence:
 *   0. problem packs (`billing_packs`, then built-in packs) — one-time purchases
 *   1. legacy static keys (pro_monthly, pro_yearly)
 *   2. admin plans in the `plans` collection (matched by `plan` key)
 *   3. built-in catalog defaults (free / pro / enterprise) when no DB plan exists
 */
export async function resolveBillingPlan(
  rawPlanId: unknown,
  interval: PlanInterval = 'month',
  /** INR / USD: use the plan's per-currency price (`prices_minor`) when it has one. */
  currency?: string | null,
): Promise<ResolvedPlan | null> {
  if (!isValidPlanId(rawPlanId)) return null
  const planId = rawPlanId

  const pack = await resolvePack(planId)
  if (pack) return pack

  const s = STATIC_PLANS[planId]
  if (s) {
    return {
      id: s.id,
      name: s.name,
      amount_paise: s.amount_paise,
      currency: s.currency,
      kind: s.kind,
      duration_days: s.duration_days,
      interval: s.duration_days === 365 ? 'year' : s.kind === 'subscription' ? 'month' : undefined,
      perks: s.perks,
      mode: s.amount_paise > 0 ? 'checkout' : 'free',
      source: 'static',
    }
  }

  let dbPlan: Record<string, unknown> | null = null
  try {
    const db = await getMongoDb()
    dbPlan = await db.collection('plans').findOne({ plan: planId }, { projection: { _id: 0 } })
  } catch (e) {
    console.error('[billing-plans] plan lookup failed:', e)
    throw new Error('Plan lookup failed')
  }

  if (dbPlan) {
    const mode = planCheckoutMode({
      id: planId,
      price: dbPlan.price,
      yearlyPrice: dbPlan.yearlyPrice,
      contactSales: dbPlan.contactSales,
    })
    const perks = Array.isArray(dbPlan.features)
      ? (dbPlan.features as unknown[])
          .filter((f) => typeof f === 'string' || (f && typeof f === 'object' && (f as { enabled?: unknown }).enabled !== false))
          .map((f) => (typeof f === 'string' ? f : String((f as { label?: unknown; key?: unknown }).label || (f as { key?: unknown }).key || '')))
          .filter(Boolean)
      : []
    const currency = typeof dbPlan.currency === 'string' && /^[A-Z]{3}$/.test(dbPlan.currency)
      ? dbPlan.currency
      : await getPlatformCurrency()
    const base: ResolvedPlan = {
      id: planId,
      name: typeof dbPlan.name === 'string' && dbPlan.name ? dbPlan.name : planId,
      amount_paise: 0,
      currency,
      kind: 'subscription',
      duration_days: durationFor(interval),
      interval,
      perks,
      mode,
      source: 'db',
    }
    if (mode !== 'checkout') return base

    // Per-currency admin prices (lib/billing/plan-prices.ts) win when the buyer's currency has one.
    const perCurrency = isBillingCurrency(currency) ? priceFor(dbPlan.prices_minor as PlanPrices | undefined, currency, interval) : null
    if (perCurrency) return { ...base, amount_paise: perCurrency, currency: currency! }

    // Same arithmetic the pricing pages display (lib/pricing-catalog-server.ts).
    const monthly = parsePlanPrice(dbPlan.price) ?? 0
    let amount = 0
    if (interval === 'year') {
      const yearly = typeof dbPlan.yearlyPrice === 'number' ? dbPlan.yearlyPrice : Math.round(monthly * 12 * 0.85)
      amount = toMinor(yearly)
    } else {
      const explicit = Number(dbPlan.amount_paise)
      amount = Number.isInteger(explicit) && explicit > 0 ? explicit : toMinor(monthly)
    }
    if (amount <= 0) return { ...base, mode: 'free' }
    return { ...base, amount_paise: amount }
  }

  const def = CATALOG_DEFAULTS.find((p) => p.id === planId)
  if (def) {
    const mode = planCheckoutMode({ id: def.id, price: def.monthlyUsd, yearlyPrice: def.yearlyUsd })
    const builtIn = def.id === 'pro' && isBillingCurrency(currency) ? priceFor(DEFAULT_PRO_PRICES, currency, interval) : null
    if (builtIn && mode === 'checkout') {
      return { id: def.id, name: def.name, amount_paise: builtIn, currency: currency!, kind: 'subscription', duration_days: durationFor(interval), interval, perks: def.features, mode, source: 'catalog' }
    }
    const major = interval === 'year' ? def.yearlyUsd : def.monthlyUsd
    return {
      id: def.id,
      name: def.name,
      amount_paise: mode === 'checkout' ? toMinor(major) : 0,
      currency: await getPlatformCurrency(),
      kind: 'subscription',
      duration_days: durationFor(interval),
      interval,
      perks: def.features,
      mode,
      source: 'catalog',
    }
  }

  return null
}

/** A pack on sale, priced from the catalog (never from the client). */
async function resolvePack(planId: string): Promise<ResolvedPlan | null> {
  let doc: ProblemPackDoc | null = null
  try {
    doc = await (await billingPacks()).findOne({ id: planId }, { projection: { _id: 0 } })
  } catch (e) {
    console.error('[billing-plans] pack lookup failed:', e)
    throw new Error('Plan lookup failed')
  }
  const def = DEFAULT_PROBLEM_PACKS.find((p) => p.id === planId)
  const pack = doc ? { ...def, ...doc } : def
  if (!pack) return null
  const price = Number(pack.price)
  const onSale = pack.active !== false && Number.isFinite(price) && price > 0
  return {
    id: pack.id,
    name: pack.name,
    amount_paise: onSale ? toMinor(price) : 0,
    currency: /^[A-Z]{3}$/.test(pack.currency || '') ? pack.currency : await getPlatformCurrency(),
    kind: 'one_time',
    perks: [pack.description || 'Lifetime access'].filter(Boolean),
    // A pack that is not on sale cannot be bought (free mode never reaches a gateway).
    mode: onSale ? 'checkout' : 'free',
    source: doc ? 'db' : 'static',
  }
}

/** Display name for a stored plan id (invoices, admin lists). */
export function storedPlanLabel(order: Pick<BillingOrderDoc, 'plan_id' | 'plan_name'>): string | null {
  if (order.plan_name) return order.plan_name
  const s = STATIC_PLANS[order.plan_id]
  if (s) return s.name
  return order.plan_id ? order.plan_id.replace(/_/g, ' ') : null
}

/** Fields to store on billing_orders when the order is created. */
export function orderPlanSnapshot(plan: ResolvedPlan): Pick<BillingOrderDoc, 'plan_id' | 'plan_name' | 'plan_kind' | 'duration_days' | 'interval'> {
  return {
    plan_id: plan.id,
    plan_name: plan.name,
    plan_kind: plan.kind,
    duration_days: plan.duration_days,
    interval: plan.interval,
  }
}

let indexesEnsured: Promise<void> | null = null

/**
 * Idempotent: one row per gateway payment id, so a replayed verify / webhook
 * can never insert a second payment row. Partial so legacy rows that store ''
 * for the other gateway's id don't collide.
 */
export function ensureBillingIndexes(): Promise<void> {
  if (!indexesEnsured) {
    indexesEnsured = (async () => {
      try {
        const payments = await billingPayments()
        await payments.createIndex(
          { razorpay_payment_id: 1 },
          { unique: true, name: 'billing_payments_razorpay_payment_id_unique', partialFilterExpression: { razorpay_payment_id: { $gt: '' } } },
        )
        await payments.createIndex(
          { phonepe_payment_id: 1 },
          { unique: true, name: 'billing_payments_phonepe_payment_id_unique', partialFilterExpression: { phonepe_payment_id: { $gt: '' } } },
        )
        await payments.createIndex({ order_id: 1 }, { name: 'billing_payments_order_id' })
        // One order (= one activation) per Stripe invoice, so a replayed invoice.paid is a no-op.
        await (await billingOrders()).createIndex(
          { stripe_invoice_id: 1 },
          { unique: true, name: 'billing_orders_stripe_invoice_id_unique', partialFilterExpression: { stripe_invoice_id: { $gt: '' } } },
        )
        // Same for each Razorpay subscription charge (payment id).
        await (await billingOrders()).createIndex(
          { razorpay_charge_id: 1 },
          { unique: true, name: 'billing_orders_razorpay_charge_id_unique', partialFilterExpression: { razorpay_charge_id: { $gt: '' } } },
        )
        await (await billingOrders()).createIndex({ razorpay_subscription_id: 1 }, { name: 'billing_orders_razorpay_subscription_id', sparse: true })
        await (await billingSubscriptions()).createIndex({ razorpay_subscription_id: 1 }, { name: 'billing_subscriptions_razorpay_subscription_id', sparse: true })
      } catch (e) {
        // Existing duplicate rows block a unique index; the atomic order claim
        // still prevents double activation. Log so ops can clean up.
        console.error('[billing-plans] could not ensure billing indexes:', e)
      }
    })()
  }
  return indexesEnsured
}

export interface ActivationResult {
  subscription: { id: string; plan_id: string; ends_at: string; trial_ends_at?: string } | null
}

/**
 * Stripe recurring billing: the period comes from Stripe (the invoice's
 * subscription period) instead of stacking duration_days, and the Stripe ids
 * are stored on the subscription. A paid invoice also clears past-due.
 */
export interface StripePeriod {
  periodStart: string
  periodEnd: string
  customerId: string
  subscriptionId: string
}

/**
 * Apply a paid order's effects. The caller MUST have atomically moved the
 * order to `paid` (only one caller per order gets here). Uses the plan
 * snapshot stored on the order; falls back to the resolver for legacy orders.
 */
/** Razorpay recurring billing: period from the Razorpay subscription (lib/billing/razorpay-subscriptions.ts). */
export interface RazorpayPeriod {
  periodStart: string
  periodEnd: string
  subscriptionId: string
}

export async function activatePaidOrder(order: BillingOrderDoc, paymentDocId?: string, stripe?: StripePeriod, razorpay?: RazorpayPeriod): Promise<ActivationResult> {
  // Licence orders fund an organisation's seats, not the buyer's own plan.
  if (order.plan_kind === 'licence') {
    const { activateLicenceOrder } = await import('@/lib/billing/licences')
    await activateLicenceOrder(order)
    await afterPaid(order)
    return { subscription: null }
  }
  let kind: BillingOrderDoc['plan_kind'] = order.plan_kind
  let durationDays = order.duration_days
  if (!kind) {
    const resolved = await resolveBillingPlan(order.plan_id, order.interval || 'month').catch(() => null)
    kind = resolved?.kind
    durationDays = durationDays ?? resolved?.duration_days
  }

  let subscription: ActivationResult['subscription'] = null

  // A trial coupon funds only the trial window (lib/billing-lifecycle.ts).
  const coupon = order.coupon_id ? await (await billingCoupons()).findOne({ id: order.coupon_id }) : null
  const trialDays = trialDaysForCoupon(coupon)
  if (kind === 'subscription' && trialDays) durationDays = trialDays

  const gw = stripe ?? razorpay
  if (kind === 'subscription' && (gw || (durationDays && durationDays > 0))) {
    const subs = await billingSubscriptions()
    const existing = await subs.findOne(
      { user_id: order.user_id, status: { $in: ['active', 'expired', 'cancelled', 'past_due'] } },
      { sort: { created_at: -1 } },
    )
    const now = new Date()
    // Renewing the same plan stacks onto the remaining time; switching plans
    // starts the new plan now.
    const extendsCurrent =
      !!existing && existing.status === 'active' && existing.plan_id === order.plan_id && new Date(existing.ends_at) > now
    // Gateway renewals use the gateway's own period (no stacking: it already bills back-to-back).
    // A same-cycle upgrade (lib/billing/proration.ts) keeps the period end it was priced for.
    const keepEnd = !gw && order.keep_period_end && Date.parse(order.keep_period_end) > now.getTime() ? order.keep_period_end : null
    const start = gw ? new Date(gw.periodStart) : keepEnd ? now : extendsCurrent ? new Date(existing!.ends_at) : now
    // CORE-036: a Razorpay subscription can't move its charge date, so free days granted on it
    // (referral reward) ride on top of every period end Razorpay reports.
    const sameRazorpaySub = !!razorpay && !!existing && existing.razorpay_subscription_id === razorpay.subscriptionId
    const endsAt = gw
      ? (sameRazorpaySub ? withGatewayBonus(gw.periodEnd, existing!.gateway_bonus_days) : gw.periodEnd)
      : keepEnd ?? new Date(start.getTime() + (durationDays ?? 0) * DAY_MS).toISOString()
    const ts = nowIso()
    const keepStart = stripe
      ? !!existing && existing.stripe_subscription_id === stripe.subscriptionId
      : razorpay
        ? !!existing && existing.razorpay_subscription_id === razorpay.subscriptionId
        : extendsCurrent
    const modeFields = stripe
      ? { billing_mode: 'stripe_subscription' as const, stripe_customer_id: stripe.customerId, stripe_subscription_id: stripe.subscriptionId }
      : razorpay
        ? { billing_mode: 'razorpay_subscription' as const, razorpay_subscription_id: razorpay.subscriptionId }
        : existing?.billing_mode === 'razorpay_subscription' && keepEnd && existing.razorpay_subscription_id
          // Prorated upgrade of a Razorpay subscription: it keeps renewing (at the new plan's price, see change-plan).
          ? { billing_mode: 'razorpay_subscription' as const, razorpay_subscription_id: existing.razorpay_subscription_id }
          : { billing_mode: 'prepaid' as const }

    // Paid orders clear any trial marker so the trial-expiry job can never end
    // a paid period; any order also undoes a pending "cancel at period end".
    const trialFields = trialDays ? { trial_ends_at: endsAt, trial_order_id: order.id } : {}
    // The bonus belongs to one Razorpay subscription; any other mode / subscription drops it.
    const keepsBonus = 'razorpay_subscription_id' in modeFields && !!existing?.razorpay_subscription_id && existing.razorpay_subscription_id === modeFields.razorpay_subscription_id
    let subId: string
    if (existing) {
      subId = existing.id
      await subs.updateOne(
        { id: existing.id },
        {
          $set: {
            status: 'active',
            plan_id: order.plan_id,
            ends_at: endsAt,
            ...(keepStart ? {} : { started_at: ts }),
            ...modeFields,
            ...(paymentDocId ? { last_payment_id: paymentDocId } : {}),
            last_order_id: order.id,
            ...trialFields,
            cancel_at_period_end: false,
            updated_at: ts,
          },
          $unset: {
            ...(trialDays ? {} : { trial_ends_at: '', trial_order_id: '' }),
            cancelled_at: '',
            past_due: '',
            past_due_since: '',
            grace_ends_at: '',
            ended_reason: '',
            ...(stripe ? {} : { stripe_subscription_id: '' }),
            ...(modeFields.billing_mode === 'razorpay_subscription' ? {} : { razorpay_subscription_id: '' }),
            // A different gateway subscription starts without the old one's bonus days.
            ...(keepsBonus ? {} : { gateway_bonus_days: '' }),
          },
        } as never,
      )
    } else {
      subId = newId()
      await subs.insertOne({
        id: subId,
        user_id: order.user_id,
        plan_id: order.plan_id,
        status: 'active',
        started_at: ts,
        ends_at: endsAt,
        ...modeFields,
        ...(paymentDocId ? { last_payment_id: paymentDocId } : {}),
        last_order_id: order.id,
        ...trialFields,
        created_at: ts,
        updated_at: ts,
      })
    }
    subscription = { id: subId, plan_id: order.plan_id, ends_at: endsAt, ...(trialDays ? { trial_ends_at: endsAt } : {}) }

    // A new plan replaced a Stripe subscription: stop the old one renewing.
    const oldStripeSub = existing?.status === 'active' && existing.billing_mode === 'stripe_subscription' ? existing.stripe_subscription_id : undefined
    if (oldStripeSub && oldStripeSub !== stripe?.subscriptionId) {
      const { cancelStripeSubscriptionNow } = await import('@/lib/stripe-subscriptions')
      await cancelStripeSubscriptionNow(oldStripeSub).catch((e) =>
        console.error('[billing-plans] could not cancel replaced Stripe subscription', oldStripeSub, e),
      )
    }
    // Prorated same-cycle upgrade of a Razorpay subscription: renew at the new plan's list price.
    if (!razorpay && keepEnd && modeFields.billing_mode === 'razorpay_subscription' && 'razorpay_subscription_id' in modeFields && modeFields.razorpay_subscription_id) {
      const rzpSubId = modeFields.razorpay_subscription_id
      const list = await resolveBillingPlan(order.plan_id, order.interval || 'month', order.currency).catch(() => null)
      if (list && list.mode === 'checkout') {
        const { switchRazorpaySubscriptionPlan } = await import('@/lib/billing/razorpay-subscriptions')
        await switchRazorpaySubscriptionPlan(rzpSubId, list).catch((e) =>
          console.error('[billing-plans] could not switch Razorpay plan', rzpSubId, (e as Error)?.message),
        )
      }
    }
    // Same for a Razorpay subscription replaced by another plan / gateway.
    const oldRzpSub = existing?.status === 'active' && existing.billing_mode === 'razorpay_subscription' ? existing.razorpay_subscription_id : undefined
    if (oldRzpSub && oldRzpSub !== ('razorpay_subscription_id' in modeFields ? modeFields.razorpay_subscription_id : undefined)) {
      const { cancelRazorpaySubscription } = await import('@/lib/billing/razorpay-subscriptions')
      await cancelRazorpaySubscription(oldRzpSub, false).catch((e) =>
        console.error('[billing-plans] could not cancel replaced Razorpay subscription', oldRzpSub, (e as Error)?.message),
      )
    }

    await (await billingOrders()).updateOne(
      { id: order.id },
      { $set: { subscription_id: subId, period_start: start.toISOString(), period_end: endsAt, updated_at: ts } },
    )
    // AUTO-088: a plan started (new, switched or re-activated — not a renewal of the same period chain).
    if (!keepStart) {
      void import('@/lib/automation/events').then(({ emit }) => emit('subscription.started', {
        user_id: order.user_id, subscription_id: subId, plan_id: order.plan_id, plan_name: order.plan_name ?? null,
        ends_at: endsAt, trial: !!trialDays, previous_plan_id: existing && existing.plan_id !== order.plan_id ? existing.plan_id : null,
      }, { idempotencyKey: `subscription.started:${order.id}` })).catch((e) => console.error('[automation] emit failed:', e))
    }

  }

  // One-time packs are not subscriptions: record the purchase on the user so
  // the pack's content can be unlocked from it.
  if (kind === 'one_time') {
    const { users } = await import('@/lib/db/admin')
    const { userIdFilter } = await import('@/lib/entitlements')
    await (await users()).updateOne(userIdFilter(order.user_id), {
      $addToSet: { purchased_packs: order.plan_id },
    } as never)
  }

  // Automation bus (dunning stop, workflows). Once per order.
  void import('@/lib/automation/events').then(({ emit }) => emit('payment.succeeded', {
    order_id: order.id, user_id: order.user_id, plan_id: order.plan_id, plan_name: order.plan_name ?? null, amount_minor: order.amount_paise, currency: order.currency,
    provider: order.phonepe_transaction_id ? 'phonepe' : order.stripe_invoice_id || String(order.razorpay_order_id || '').startsWith('stripe_') ? 'stripe' : 'razorpay',
  }, { idempotencyKey: `payment.succeeded:${order.id}` })).catch((e) => console.error('[automation] emit failed:', e))

  if (order.coupon_id) {
    await finalizeCouponRedemption(order.coupon_id, order.user_id, order.id, order.plan_id).catch((e) =>
      console.error('[billing-plans] coupon redemption record failed:', e),
    )
  }
  await afterPaid(order)

  return { subscription }
}

/** Effects every paid order gets once: tax invoice number, account credit used, referral reward queued. */
async function afterPaid(order: BillingOrderDoc): Promise<void> {
  await import('@/lib/billing/tax-invoice')
    .then(({ assignInvoice }) => assignInvoice(order))
    .catch((e) => console.error('[billing-plans] invoice numbering failed', order.id, (e as Error)?.message))
  if (order.credit_applied && order.credit_applied > 0) {
    await import('@/lib/billing/credits')
      .then(({ debitCreditForOrder }) => debitCreditForOrder(order))
      .catch((e) => console.error('[billing-plans] credit debit failed', order.id, (e as Error)?.message))
  }
  if (order.amount_paise > 0 && order.plan_kind !== 'licence') {
    await import('@/lib/billing/referrals')
      .then(({ queueReferralReward }) => queueReferralReward(order))
      .catch((e) => console.error('[billing-plans] referral queue failed', order.id, (e as Error)?.message))
  }
}

export type RefundOutcome =
  | { ok: true; order: BillingOrderDoc; downgraded: boolean; shortened: boolean }
  | { ok: false; code: 'not_found' | 'not_refundable' }

/**
 * Record a refund that was issued in the gateway dashboard. Atomic: only a
 * `paid` order can move to `refunded`, once. If the order funded the
 * subscription's current period the user drops to Free; if it funded a
 * future (stacked) period, that period is removed.
 */
export async function markOrderRefunded(
  orderId: string,
  actor: { id: string; email: string },
  note: string,
): Promise<RefundOutcome> {
  const orders = await billingOrders()
  const ts = nowIso()
  const claim = await orders.updateOne(
    { id: orderId, status: 'paid' },
    {
      $set: {
        status: 'refunded',
        refunded_at: ts,
        refunded_by: actor.id,
        refunded_by_email: actor.email,
        refund_note: note,
        updated_at: ts,
      },
    },
  )
  if (claim.modifiedCount === 0) {
    const exists = await orders.findOne({ id: orderId }, { projection: { _id: 1 } })
    return { ok: false, code: exists ? 'not_refundable' : 'not_found' }
  }
  const order = (await orders.findOne({ id: orderId }, { projection: { _id: 0 } })) as BillingOrderDoc

  await (await billingPayments()).updateMany({ order_id: order.id }, { $set: { status: 'refunded' } })

  // A refunded pack is taken back (purchases otherwise never expire).
  if (order.plan_kind === 'one_time') {
    const { users } = await import('@/lib/db/admin')
    const { userIdFilter } = await import('@/lib/entitlements')
    await (await users()).updateOne(userIdFilter(order.user_id), { $pull: { purchased_packs: order.plan_id } } as never)
  }

  let downgraded = false
  let shortened = false
  const subs = await billingSubscriptions()
  const sub = await subs.findOne({ user_id: order.user_id, status: 'active' })
  if (sub && sub.plan_id === order.plan_id) {
    const now = Date.now()
    const start = order.period_start ? Date.parse(order.period_start) : NaN
    const end = order.period_end ? Date.parse(order.period_end) : NaN
    const hasWindow = Number.isFinite(start) && Number.isFinite(end)
    const fundsCurrent = hasWindow ? start <= now && now < end : sub.last_order_id === order.id
    if (fundsCurrent) {
      await subs.updateOne({ id: sub.id }, { $set: { status: 'cancelled', ends_at: ts, updated_at: ts } })
      downgraded = true
    } else if (hasWindow && start > now && sub.ends_at === order.period_end) {
      await subs.updateOne({ id: sub.id }, { $set: { ends_at: order.period_start!, updated_at: ts } })
      shortened = true
    }
  }

  return { ok: true, order, downgraded, shortened }
}


/** The user's live subscription (latest period first). */
async function liveSub(userId: string): Promise<BillingSubscriptionDoc | null> {
  return (await billingSubscriptions()).findOne(
    { user_id: userId, status: 'active', ends_at: { $gt: nowIso() } },
    { sort: { ends_at: -1 } },
  )
}

/**
 * Cancel at period end (D8): the plan stays active until `ends_at`, then
 * lapses (every reader checks `ends_at`). A Stripe subscription is told first
 * (cancel_at_period_end) so it stops renewing; if Stripe refuses, nothing
 * changes here and the error surfaces. Prepaid periods need no gateway call.
 */
export async function cancelAtPeriodEnd(userId: string): Promise<{ ends_at: string } | null> {
  const current = await liveSub(userId)
  if (!current) return null
  if (current.billing_mode === 'stripe_subscription' && current.stripe_subscription_id) {
    const { setStripeCancelAtPeriodEnd } = await import('@/lib/stripe-subscriptions')
    await setStripeCancelAtPeriodEnd(current.stripe_subscription_id, true)
  }
  const ts = nowIso()
  const sub = await (await billingSubscriptions()).findOneAndUpdate(
    { id: current.id, status: 'active' },
    { $set: { cancel_at_period_end: true, cancelled_at: ts, updated_at: ts } },
    { returnDocument: 'after' },
  )
  // AUTO-088: one event per subscription period (repeat clicks are duplicates).
  if (sub) void import('@/lib/automation/events').then(({ emit }) => emit('subscription.cancelled', {
    user_id: userId, subscription_id: sub.id, plan_id: sub.plan_id, access_until: sub.ends_at, cancelled_at: ts,
  }, { idempotencyKey: `subscription.cancelled:${sub.id}:${sub.ends_at}` })).catch((e) => console.error('[automation] emit failed:', e))
  return sub ? { ends_at: sub.ends_at } : null
}

/** Undo a pending cancel while the period is still running ("Keep my plan"). */
export async function resumeSubscription(userId: string): Promise<boolean> {
  const current = await liveSub(userId)
  if (!current || current.cancel_at_period_end !== true) return false
  // A Razorpay subscription already cancelled at the gateway (close to renewal) can't be revived.
  if ((current as { razorpay_cancelled_at?: string }).razorpay_cancelled_at) return false
  if (current.billing_mode === 'stripe_subscription' && current.stripe_subscription_id) {
    const { setStripeCancelAtPeriodEnd } = await import('@/lib/stripe-subscriptions')
    await setStripeCancelAtPeriodEnd(current.stripe_subscription_id, false)
  }
  const ts = nowIso()
  const res = await (await billingSubscriptions()).updateOne(
    { id: current.id, status: 'active', cancel_at_period_end: true },
    { $set: { cancel_at_period_end: false, updated_at: ts }, $unset: { cancelled_at: '' } },
  )
  return res.modifiedCount > 0
}

/**
 * Downgrade past-due Stripe subscriptions whose grace window ran out: the
 * subscription ends here and is cancelled at Stripe so it stops retrying.
 * Access already lapses at ends_at (= grace end); this makes it final.
 * Meant to run daily from the scheduler.
 */
export async function endLapsedGracePeriods(now: Date = new Date()): Promise<number> {
  const subs = await billingSubscriptions()
  const due = await subs
    .find({ status: 'active', past_due: true, grace_ends_at: { $lte: now.toISOString() } } as never, { projection: { _id: 0 } })
    .limit(500)
    .toArray()
  let n = 0
  for (const sub of due) {
    if (!graceExpired(sub, now)) continue
    const r = await subs.updateOne(
      { id: sub.id, status: 'active', past_due: true },
      { $set: { status: 'expired', ends_at: sub.grace_ends_at!, ended_reason: 'payment_failed', updated_at: now.toISOString() } },
    )
    if (r.modifiedCount === 0) continue
    n++
    if (sub.stripe_subscription_id) {
      const { cancelStripeSubscriptionNow } = await import('@/lib/stripe-subscriptions')
      await cancelStripeSubscriptionNow(sub.stripe_subscription_id).catch((e) =>
        console.error('[billing-plans] could not cancel lapsed Stripe subscription', sub.stripe_subscription_id, e),
      )
    }
    if (sub.razorpay_subscription_id) {
      const { cancelRazorpaySubscription } = await import('@/lib/billing/razorpay-subscriptions')
      await cancelRazorpaySubscription(sub.razorpay_subscription_id, false).catch((e) =>
        console.error('[billing-plans] could not cancel lapsed Razorpay subscription', sub.razorpay_subscription_id, (e as Error)?.message),
      )
    }
  }
  return n
}
