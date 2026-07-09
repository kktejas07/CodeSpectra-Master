import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { billingOrders, billingPayments } from '@/lib/db/billing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getAPIUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orders = await billingOrders()
    const userOrders = await orders
      .find({ user_id: user.id })
      .sort({ created_at: -1 })
      .limit(50)
      .toArray()

    const paymentsCol = await billingPayments()
    const paymentIds = userOrders.map((o) => o.id)
    const paymentsData = paymentIds.length > 0
      ? await paymentsCol.find({ order_id: { $in: paymentIds } }).toArray()
      : []

    const paymentsByOrder = new Map(paymentsData.map((p) => [p.order_id, p]))

    const invoices = userOrders.map((order) => ({
      id: order.id,
      amount_paise: order.amount_paise,
      currency: order.currency,
      status: order.status,
      plan_id: order.plan_id,
      created_at: order.created_at,
      razorpay_order_id: order.razorpay_order_id,
      payment: paymentsByOrder.get(order.id) || null,
    }))

    return NextResponse.json({ invoices })
  } catch (error) {
    console.error('[billing/invoices] error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
