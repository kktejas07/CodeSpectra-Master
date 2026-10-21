import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { verifyPaymentSignature, getRazorpay } from '@/lib/razorpay-server'
import {
  billingOrders,
  billingPayments,
  billingSubscriptions,
  newId,
  nowIso,
} from '@/lib/db/billing'
import { activatePaidOrder, ensureBillingIndexes } from '@/lib/billing-plans'
import { sanitizeMongoInput } from '@/lib/mongo-sanitize'

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
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  let body: VerifyReq
  try {
    body = sanitizeMongoInput(await req.json()) as VerifyReq
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
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

  await ensureBillingIndexes()
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
  if (order.status === 'refunded') return NextResponse.json({ error: 'order_refunded' }, { status: 409 })

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
    // Manual-capture accounts: an authorized payment is not money yet (it is
    // auto-refunded if never captured), so capture it before activating (D34).
    if (String(pay.status) === 'authorized') {
      const captured = await rp.payments.capture(body.razorpay_payment_id, order.amount_paise, order.currency)
      if (String(captured?.status) !== 'captured') {
        return NextResponse.json({ error: 'Payment is not captured yet. Try again shortly.' }, { status: 502 })
      }
    }
  } catch (e) {
    console.error('[billing/verify] payment fetch failed:', e)
    return NextResponse.json({ error: 'Could not confirm payment with the gateway. Try again shortly.' }, { status: 502 })
  }

  // Atomic claim: only one caller (verify replay, concurrent verify, or webhook)
  // gets to apply the order's effects.
  const claim = await ordersCol.updateOne(
    { id: order.id, status: { $in: ['created', 'attempted', 'failed'] } },
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
  try {
    await paymentsCol.updateOne(
      { razorpay_payment_id: body.razorpay_payment_id },
      { $setOnInsert: paymentDoc },
      { upsert: true },
    )
  } catch (e) {
    // Concurrent upsert lost the race against the unique index: row exists.
    if ((e as { code?: number })?.code !== 11000) throw e
  }

  // The webhook may have inserted the row first: use the stored row's id (D35).
  const storedPayment = await paymentsCol.findOne({ razorpay_payment_id: body.razorpay_payment_id }, { projection: { id: 1 } })
  const paymentRowId = storedPayment?.id ?? paymentDoc.id

  // Activate exactly the plan snapshotted on the order (static or admin-created).
  const { subscription } = await activatePaidOrder({ ...order, status: 'paid' }, paymentRowId)

  return NextResponse.json({
    ok: true,
    order_id: order.id,
    payment_id: paymentRowId,
    plan_id: order.plan_id,
    subscription,
  })
}
