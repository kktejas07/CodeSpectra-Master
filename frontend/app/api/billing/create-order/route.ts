import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getRazorpay, getPublishableKeyId, isRazorpayConfigured } from '@/lib/razorpay-server'
import {
  BILLING_PLANS,
  billingOrders,
  newId,
  nowIso,
} from '@/lib/db/billing'

export const runtime = 'nodejs'

interface CreateOrderReq {
  plan_id: keyof typeof BILLING_PLANS
}

/**
 * POST /api/billing/create-order
 * Creates a Razorpay order for the requested plan + persists a `billing_orders`
 * row in MongoDB. Returns the order details that the client passes to
 * Razorpay Checkout.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!(await isRazorpayConfigured())) {
    return NextResponse.json(
      {
        error: 'razorpay_not_configured',
        message:
          'Payments are not yet activated. A super-admin can set the keys at /dashboard/admin/settings?section=integrations.',
      },
      { status: 503 },
    )
  }

  let body: CreateOrderReq
  try {
    body = (await req.json()) as CreateOrderReq
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const plan = BILLING_PLANS[body.plan_id]
  if (!plan) {
    return NextResponse.json({ error: 'unknown plan_id' }, { status: 400 })
  }

  const id = newId()
  // Razorpay receipt must be ≤ 40 chars.
  const receipt = `cs_${id.replace(/-/g, '').slice(0, 32)}`

  try {
    const rzp = await getRazorpay()
    const order = await rzp.orders.create({
      amount: plan.amount_paise,
      currency: plan.currency,
      receipt,
      notes: {
        plan_id: plan.id,
        user_id: user.id,
        user_email: user.email,
      },
    })

    const orders = await billingOrders()
    await orders.insertOne({
      id,
      user_id: user.id,
      razorpay_order_id: order.id,
      amount_paise: plan.amount_paise,
      currency: plan.currency,
      plan_id: plan.id,
      receipt,
      status: 'created',
      notes: { plan_id: plan.id },
      created_at: nowIso(),
      updated_at: nowIso(),
    })

    return NextResponse.json({
      order_id: order.id,
      internal_id: id,
      amount_paise: plan.amount_paise,
      currency: plan.currency,
      plan: { id: plan.id, name: plan.name, perks: plan.perks },
      key_id: await getPublishableKeyId(),
      prefill: { name: user.name || user.email, email: user.email },
    })
  } catch (e) {
    console.error('[billing/create-order]', e)
    return NextResponse.json(
      { error: 'razorpay_create_order_failed', detail: String(e) },
      { status: 502 },
    )
  }
}
