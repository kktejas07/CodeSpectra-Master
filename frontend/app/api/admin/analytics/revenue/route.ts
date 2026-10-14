import { formatDate } from '@/lib/format-datetime'
/**
 * GET /api/admin/analytics/revenue — Revenue analytics (superadmin).
 *
 * Queries billing_orders, billing_payments, billing_subscriptions, plans.
 * Returns MRR, ARR, total revenue, revenue by plan, churn, coupon usage.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { searchParams } = new URL(req.url)
  const range = searchParams.get('range') || '30d'
  const now = new Date()
  let since: Date
  if (range === '90d') since = new Date(now.getTime() - 90 * 86400_000)
  else if (range === '7d') since = new Date(now.getTime() - 7 * 86400_000)
  else since = new Date(now.getTime() - 30 * 86400_000)
  const sinceIso = since.toISOString()

  try {
    const db = await getMongoDb()

    // Active subscriptions
    const activeSubs = await db.collection('billing_subscriptions')
      .find({ status: 'active' })
      .toArray()

    // Cancelled/expired in period
    const cancelledInPeriod = await db.collection('billing_subscriptions')
      .countDocuments({ status: { $in: ['cancelled', 'expired'] }, ends_at: { $gte: sinceIso } })

    // Total subscriptions ever
    const totalEver = await db.collection('billing_subscriptions').countDocuments()

    // Plans catalog (for price lookup)
    const plans = await db.collection('plans').find({}).toArray()
    const planPrices: Record<string, number> = {}
    for (const p of plans) {
      const id = (p.plan || p.id || p._id?.toString() || '') as string
      const price = Number(p.price) || 0
      planPrices[id] = price
    }

    // Compute MRR from active subscriptions
    let mrr = 0
    const subsByPlan: Record<string, number> = {}
    for (const sub of activeSubs) {
      const planId = sub.plan_id || 'unknown'
      const price = planPrices[planId] || 0
      // Normalize yearly to monthly
      const isYearly = planId.includes('yearly') || planId.includes('annual')
      const monthlyPrice = isYearly ? price / 12 : price
      mrr += monthlyPrice
      subsByPlan[planId] = (subsByPlan[planId] || 0) + 1
    }

    // Paid orders in period
    const paidOrders = await db.collection('billing_orders')
      .find({ status: 'paid', created_at: { $gte: sinceIso } })
      .toArray()

    const totalRevenue = paidOrders.reduce((sum: number, o: any) => sum + (Number(o.amount_paise) || 0) / 100, 0)

    // Revenue by plan
    const revenueByPlan: Record<string, number> = {}
    for (const o of paidOrders) {
      const plan = o.plan_id || 'unknown'
      revenueByPlan[plan] = (revenueByPlan[plan] || 0) + (Number(o.amount_paise) || 0) / 100
    }

    // Payment method breakdown
    const payments = await db.collection('billing_payments')
      .find({ status: 'captured', created_at: { $gte: sinceIso } })
      .toArray()
    const byMethod: Record<string, number> = {}
    for (const p of payments) {
      const method = p.method || 'unknown'
      byMethod[method] = (byMethod[method] || 0) + 1
    }

    // Coupon usage
    const coupons = await db.collection('billing_coupons').find({}).toArray()
    const totalRedemptions = coupons.reduce((sum: number, c: any) => sum + (c.current_uses || 0), 0)

    // Monthly revenue trend (last 6 months)
    const monthlyTrend: { month: string; revenue: number; subscriptions: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1).toISOString()
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59).toISOString()
      const monthOrders = await db.collection('billing_orders')
        .find({ status: 'paid', created_at: { $gte: monthStart, $lte: monthEnd } })
        .toArray()
      const monthRevenue = monthOrders.reduce((sum: number, o: any) => sum + (Number(o.amount_paise) || 0) / 100, 0)
      const monthLabel = formatDate(new Date(now.getFullYear(), now.getMonth() - i, 1), undefined, { month: 'short' })
      monthlyTrend.push({ month: monthLabel, revenue: Math.round(monthRevenue), subscriptions: monthOrders.length })
    }

    // Churn rate
    const churnRate = totalEver > 0 ? Math.round((cancelledInPeriod / Math.max(activeSubs.length, 1)) * 10000) / 100 : 0

    // Currency
    const general = await db.collection('platform_settings').findOne({ key: 'general' })
    const currency = general?.value?.platform_currency || 'USD'

    return NextResponse.json({
      mrr: Math.round(mrr),
      arr: Math.round(mrr * 12),
      totalRevenue: Math.round(totalRevenue),
      activeSubscriptions: activeSubs.length,
      totalEver,
      cancelledInPeriod,
      churnRate,
      totalOrders: paidOrders.length,
      revenueByPlan: Object.entries(revenueByPlan).map(([plan, rev]) => ({ plan, revenue: Math.round(rev) })),
      subsByPlan: Object.entries(subsByPlan).map(([plan, count]) => ({ plan, count })),
      paymentMethods: Object.entries(byMethod).map(([method, count]) => ({ method, count })),
      totalRedemptions,
      monthlyTrend,
      currency,
      range,
    })
  } catch (e) {
    console.error('[revenue analytics] error:', e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
