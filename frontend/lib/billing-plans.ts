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
  billingCoupons,
  billingOrders,
  billingPayments,
  billingSubscriptions,
  newId,
  nowIso,
  recordCouponRedemption,
  type BillingOrderDoc,
} from '@/lib/db/billing'
import {
  isValidPlanId,
  parsePlanPrice,
  planCheckoutMode,
  type PlanCheckoutMode,
  type PlanInterval,
} from '@/lib/billing-plan-mode'

export interface ResolvedPlan {
  /** Canonical id stored on the order and the subscription. */
  id: string
  name: string
  /** Minor units (paise / cents) of `currency`. 0 unless mode === 'checkout'. */
  amount_paise: number
  currency: string
  kind: 'one_time' | 'subscription'
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
 *   1. legacy static keys (pro_monthly, pro_yearly, problem_pack_50)
 *   2. admin plans in the `plans` collection (matched by `plan` key)
 *   3. built-in catalog defaults (free / pro / enterprise) when no DB plan exists
 */
export async function resolveBillingPlan(
  rawPlanId: unknown,
  interval: PlanInterval = 'month',
): Promise<ResolvedPlan | null> {
  if (!isValidPlanId(rawPlanId)) return null
  const planId = rawPlanId

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
 * Apply a paid order's effects. The caller MUST have atomically moved the
 * order to `paid` (only one caller per order gets here). Uses the plan
 * snapshot stored on the order; falls back to the resolver for legacy orders.
 */
export async function activatePaidOrder(order: BillingOrderDoc, paymentDocId?: string): Promise<ActivationResult> {
  let kind = order.plan_kind
  let durationDays = order.duration_days
  if (!kind) {
    const resolved = await resolveBillingPlan(order.plan_id, order.interval || 'month').catch(() => null)
    kind = resolved?.kind
    durationDays = durationDays ?? resolved?.duration_days
  }

  let subscription: ActivationResult['subscription'] = null

  if (kind === 'subscription' && durationDays && durationDays > 0) {
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
    const start = extendsCurrent ? new Date(existing!.ends_at) : now
    const endsAt = new Date(start.getTime() + durationDays * DAY_MS).toISOString()
    const ts = nowIso()

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
            ...(extendsCurrent ? {} : { started_at: ts }),
            ...(paymentDocId ? { last_payment_id: paymentDocId } : {}),
            last_order_id: order.id,
            updated_at: ts,
          },
        },
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
        ...(paymentDocId ? { last_payment_id: paymentDocId } : {}),
        last_order_id: order.id,
        created_at: ts,
        updated_at: ts,
      })
    }
    subscription = { id: subId, plan_id: order.plan_id, ends_at: endsAt }

    await (await billingOrders()).updateOne(
      { id: order.id },
      { $set: { subscription_id: subId, period_start: start.toISOString(), period_end: endsAt, updated_at: ts } },
    )

    if (order.coupon_id) {
      const coupon = await (await billingCoupons()).findOne({ id: order.coupon_id })
      if (coupon?.discount_type === 'trial' && coupon.trial_duration_days) {
        const trialEnds = new Date(Date.now() + coupon.trial_duration_days * DAY_MS).toISOString()
        await subs.updateOne({ id: subId }, { $set: { trial_ends_at: trialEnds } })
        subscription = { ...subscription, trial_ends_at: trialEnds }
      }
    }
  }

  if (order.coupon_id) {
    await recordCouponRedemption(order.coupon_id, order.user_id, order.id, order.plan_id).catch((e) =>
      console.error('[billing-plans] coupon redemption record failed:', e),
    )
  }

  return { subscription }
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
