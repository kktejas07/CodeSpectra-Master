import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { billingOrders, billingPayments, type BillingOrderDoc } from '@/lib/db/billing'
import { storedPlanLabel } from '@/lib/billing-plans'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/billing/admin/orders?status=paid|refunded|all — superadmin only.
 * Recent paid/refunded orders (the payments list on /dashboard/admin/billing).
 */
export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const raw = req.nextUrl.searchParams.get('status')
  const statuses: BillingOrderDoc['status'][] =
    raw === 'paid' ? ['paid'] : raw === 'refunded' ? ['refunded'] : ['paid', 'refunded']

  try {
    const orders = await (await billingOrders())
      .find({ status: { $in: statuses } }, { projection: { _id: 0 } })
      .sort({ created_at: -1 })
      .limit(100)
      .toArray()

    const orderIds = orders.map((o) => o.id)
    const userIds = [...new Set(orders.map((o) => o.user_id))]
    const [payments, users] = await Promise.all([
      orderIds.length
        ? (await billingPayments()).find({ order_id: { $in: orderIds } }, { projection: { _id: 0, order_id: 1, razorpay_payment_id: 1, phonepe_payment_id: 1 } }).toArray()
        : [],
      userIds.length
        ? (await getMongoDb()).collection('user').find({ id: { $in: userIds } }, { projection: { _id: 0, id: 1, email: 1, name: 1, fullName: 1 } }).toArray()
        : [],
    ])
    const payByOrder = new Map(payments.map((p) => [p.order_id, p]))
    const userById = new Map(users.map((u) => [String(u.id), u]))

    const now = Date.now()
    const items = orders.map((o) => {
      const u = userById.get(o.user_id)
      const p = payByOrder.get(o.id)
      const start = o.period_start ? Date.parse(o.period_start) : NaN
      const end = o.period_end ? Date.parse(o.period_end) : NaN
      return {
        id: o.id,
        created_at: o.created_at,
        status: o.status,
        amount: (o.amount_paise || 0) / 100,
        currency: o.currency || 'INR',
        plan_id: o.plan_id,
        plan_name: storedPlanLabel(o),
        user_id: o.user_id,
        user_email: (u?.email as string) || null,
        user_name: (u?.fullName as string) || (u?.name as string) || null,
        gateway: o.razorpay_order_id ? (o.razorpay_order_id.startsWith('stripe_') ? 'stripe' : 'razorpay') : o.phonepe_transaction_id ? 'phonepe' : 'coupon',
        payment_ref: p?.razorpay_payment_id || p?.phonepe_payment_id || null,
        funds_current_period: Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end,
        refunded_at: o.refunded_at ?? null,
        refunded_by_email: o.refunded_by_email ?? null,
        refund_note: o.refund_note ?? null,
      }
    })
    return NextResponse.json({ items })
  } catch (e) {
    console.error('[billing/admin/orders] GET:', e)
    return NextResponse.json({ error: 'Could not load payments' }, { status: 500 })
  }
}
