import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const { getMongoDb } = await import('@/lib/mongodb')
    const db = await getMongoDb()

    const subsCol = db.collection('billing_subscriptions')
    const ordersCol = db.collection('billing_orders')

    // Active subscriptions
    const now = new Date().toISOString()
    const activeSubs = await subsCol.countDocuments({ status: 'active', ends_at: { $gte: now } })
    const cancelledSubs = await subsCol.countDocuments({ status: 'cancelled' })
    const totalSubs = await subsCol.estimatedDocumentCount()

    // Revenue
    const paidOrders = await ordersCol.find({ status: 'paid' }).toArray()
    const totalRevenue = paidOrders.reduce((sum, o) => sum + (o.amount_paise || 0), 0)
    const usdRevenue = paidOrders
      .filter((o) => o.currency === 'USD')
      .reduce((sum, o) => sum + (o.amount_paise || 0), 0)
    const inrRevenue = paidOrders
      .filter((o) => o.currency === 'INR')
      .reduce((sum, o) => sum + (o.amount_paise || 0), 0)

    // Orders by plan
    const ordersByPlan = await ordersCol.aggregate([
      { $group: { _id: '$plan_id', count: { $sum: 1 }, total: { $sum: '$amount_paise' } } },
      { $sort: { total: -1 } },
    ]).toArray()

    // Revenue over time (last 30 days, grouped by day)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
    const recentOrders = await ordersCol.find({
      status: 'paid',
      created_at: { $gte: thirtyDaysAgo },
    }).toArray()

    const revenueByDay: Record<string, number> = {}
    for (const o of recentOrders) {
      const day = (o.created_at || '').slice(0, 10)
      if (day) revenueByDay[day] = (revenueByDay[day] || 0) + (o.amount_paise || 0)
    }

    // Recent subscriptions
    const recentSubs = await subsCol.find()
      .sort({ created_at: -1 })
      .limit(20)
      .toArray()

    return NextResponse.json({
      stats: {
        active_subscriptions: activeSubs,
        cancelled_subscriptions: cancelledSubs,
        total_subscriptions: totalSubs,
        total_revenue_paise: totalRevenue,
        usd_revenue_paise: usdRevenue,
        inr_revenue_paise: inrRevenue,
        mrr_paise: usdRevenue > 0 ? Math.round(usdRevenue / 30) : 0,
      },
      orders_by_plan: ordersByPlan,
      revenue_by_day: revenueByDay,
      recent_subscriptions: recentSubs.map((s) => ({
        id: s.id, plan_id: s.plan_id, status: s.status,
        created_at: s.created_at,
        user_id: s.user_id ? `${String(s.user_id).slice(0, 8)}…` : null,
      })),
    })
  } catch (error) {
    console.error('[billing-stats]', error)
    return NextResponse.json({ error: 'Failed to load billing stats' }, { status: 500 })
  }
}
