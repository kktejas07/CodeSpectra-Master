import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { billingOrders, billingPayments } from '@/lib/db/billing'
import { INVOICE_STATUSES, toInvoiceView } from '@/lib/billing/invoice'

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
      .find({ user_id: user.id, status: { $in: INVOICE_STATUSES } })
      .sort({ created_at: -1 })
      .limit(50)
      .toArray()

    const paymentsCol = await billingPayments()
    const paymentIds = userOrders.map((o) => o.id)
    const paymentsData = paymentIds.length > 0
      ? await paymentsCol.find({ order_id: { $in: paymentIds }, user_id: user.id }).toArray()
      : []

    const paymentsByOrder = new Map(paymentsData.map((p) => [p.order_id, p]))

    // Only paid/refunded orders are invoices; shape matches GET /api/billing/invoices/[id].
    const invoices = userOrders.map((order) => toInvoiceView(order, paymentsByOrder.get(order.id) || null))

    return NextResponse.json({ invoices })
  } catch (error) {
    console.error('[billing/invoices] error:', error)
    return NextResponse.json({ error: 'Could not load invoices' }, { status: 500 })
  }
}
