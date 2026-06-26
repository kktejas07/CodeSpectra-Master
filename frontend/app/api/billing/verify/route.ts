import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { verifyPaymentSignature } from '@/lib/razorpay-server'
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
}

/**
 * POST /api/billing/verify
 * Verifies the signature returned by Razorpay Checkout against
 * `HMAC_SHA256(order_id|payment_id, key_secret)`. On success:
 *   - marks the order as `paid`
 *   - inserts a `billing_payments` row
 *   - (for subscription plans) creates/extends a `billing_subscriptions` row
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

  await ordersCol.updateOne(
    { id: order.id },
    { $set: { status: 'paid', updated_at: nowIso() } },
  )

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
  await paymentsCol.insertOne(paymentDoc)

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
  }

  return NextResponse.json({
    ok: true,
    order_id: order.id,
    payment_id: paymentDoc.id,
    plan_id: order.plan_id,
    subscription,
  })
}
