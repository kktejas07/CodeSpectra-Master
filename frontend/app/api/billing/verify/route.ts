import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { verifyPaymentSignature, getRazorpay } from '@/lib/razorpay-server'
import {
  BILLING_PLANS,
  billingOrders,
  billingPayments,
  billingSubscriptions,
  newId,
  nowIso,
} from '@/lib/db/billing'

export const runtime = 'nodejs'

interface VerifyReq {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
  /** Optional: the plan the client thinks it bought; must match the order. */
  plan_id?: string
}

/**
 * POST /api/billing/verify
 * Verifies the signature returned by Razorpay Checkout against
 * `HMAC_SHA256(order_id|payment_id, key_secret)`. On success:
 *   - marks the order as `paid`
 *   - inserts a `billing_payments` row
 *   - (for subscription plans) creates/extends a `billing_subscriptions` row
 *
 * Idempotent: the order is claimed atomically (`status != 'paid'` → `paid`), so a
 * replayed handler payload (or a webhook that got there first) returns success
 * without extending the subscription again.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: VerifyReq
  try {
    body = (await req.json()) as VerifyReq
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.razorpay_order_id || !body.razorpay_payment_id || !body.razorpay_signature) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  }

  const ok = await verifyPaymentSignature({
    order_id: body.razorpay_order_id,
    payment_id: body.razorpay_payment_id,
    signature: body.razorpay_signature,
  })
  if (!ok) {
    return NextResponse.json({ error: 'signature_mismatch' }, { status: 400 })
  }

  const ordersCol = await billingOrders()
  const order = await ordersCol.findOne({
    razorpay_order_id: body.razorpay_order_id,
    user_id: user.id,
  })
  if (!order) {
    return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
  }

  if (body.plan_id && body.plan_id !== order.plan_id) {
    return NextResponse.json({ error: 'plan_mismatch' }, { status: 400 })
  }

  const alreadyProcessed = async () => {
    const subs = await billingSubscriptions()
    const active = await subs.findOne({ user_id: user.id, status: 'active' })
    return NextResponse.json({
      ok: true,
      already_processed: true,
      order_id: order.id,
      plan_id: order.plan_id,
      subscription: active ? { id: active.id, ends_at: active.ends_at } : null,
    })
  }
  if (order.status === 'paid') return alreadyProcessed()

  // Confirm with Razorpay that this payment belongs to this order and covers
  // the amount we charged (the signature alone doesn't prove the amount).
  try {
    const rp = await getRazorpay()
    const pay = await rp.payments.fetch(body.razorpay_payment_id)
    if (
      pay.order_id !== body.razorpay_order_id ||
      Number(pay.amount) !== order.amount_paise ||
      String(pay.currency).toUpperCase() !== String(order.currency).toUpperCase() ||
      !['captured', 'authorized'].includes(String(pay.status))
    ) {
      return NextResponse.json({ error: 'payment_mismatch' }, { status: 400 })
    }
  } catch (e) {
    console.error('[billing/verify] payment fetch failed:', e)
    return NextResponse.json({ error: 'Could not confirm payment with the gateway. Try again shortly.' }, { status: 502 })
  }

  // Atomic claim: only one caller (verify replay, concurrent verify, or webhook)
  // gets to apply the order's effects.
  const claim = await ordersCol.updateOne(
    { id: order.id, status: { $ne: 'paid' } },
    { $set: { status: 'paid', updated_at: nowIso() } },
  )
  if (claim.modifiedCount === 0) return alreadyProcessed()

  const paymentsCol = await billingPayments()
  const paymentDoc = {
    id: newId(),
    user_id: user.id,
    order_id: order.id,
    razorpay_payment_id: body.razorpay_payment_id,
    signature: body.razorpay_signature,
    status: 'captured' as const,
    amount_paise: order.amount_paise,
    created_at: nowIso(),
  }
  // Upsert on the gateway payment id so a webhook-inserted row isn't duplicated.
  await paymentsCol.updateOne(
    { razorpay_payment_id: body.razorpay_payment_id },
    { $setOnInsert: paymentDoc },
    { upsert: true },
  )

  // If this plan is a subscription, create/extend a subscription record.
  const plan = BILLING_PLANS[order.plan_id]
  let subscription: { id: string; ends_at: string } | null = null
  if (plan?.kind === 'subscription' && plan.duration_days) {
    const subs = await billingSubscriptions()
    const existing = await subs.findOne({ user_id: user.id, status: 'active' })
    const now = new Date()
    const baseExpiry =
      existing && new Date(existing.ends_at) > now
        ? new Date(existing.ends_at)
        : now
    const ends_at = new Date(
      baseExpiry.getTime() + plan.duration_days * 24 * 60 * 60 * 1000,
    ).toISOString()

    if (existing) {
      await subs.updateOne(
        { id: existing.id },
        { $set: { ends_at, last_payment_id: paymentDoc.id, plan_id: plan.id } },
      )
      subscription = { id: existing.id, ends_at }
    } else {
      const sId = newId()
      await subs.insertOne({
        id: sId,
        user_id: user.id,
        plan_id: plan.id,
        status: 'active',
        started_at: nowIso(),
        ends_at,
        last_payment_id: paymentDoc.id,
        created_at: nowIso(),
      })
      subscription = { id: sId, ends_at }
    }

    // If the order used a trial coupon, mark the subscription
    if (order.coupon_id) {
      const { billingCoupons, recordCouponRedemption } = await import('@/lib/db/billing')
      const couponsCol = await billingCoupons()
      const coupon = await couponsCol.findOne({ id: order.coupon_id })
      if (coupon?.discount_type === 'trial' && coupon?.trial_duration_days) {
        const trialEnds = new Date(Date.now() + coupon.trial_duration_days * 86400000).toISOString()
        await subs.updateOne(
          { id: subscription.id },
          { $set: { trial_ends_at: trialEnds } }
        )
        subscription = { ...subscription, trial_ends_at: trialEnds } as any
      }
      // Track redemption
      await recordCouponRedemption(order.coupon_id, user.id, order.id, order.plan_id).catch(() => {})
    }
  }

  return NextResponse.json({
    ok: true,
    order_id: order.id,
    payment_id: paymentDoc.id,
    plan_id: order.plan_id,
    subscription,
  })
}
