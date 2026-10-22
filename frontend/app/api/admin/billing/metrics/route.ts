import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { apiErrorFor } from '@/lib/api-errors'
import { billingOrders, billingSubscriptions } from '@/lib/db/billing'
import { revenueMetrics, type MetricSub } from '@/lib/billing/metrics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/admin/billing/metrics?days=30 — MRR / ARR / churn per currency (lib/billing/metrics.ts). */
export async function GET(req: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const days = Math.min(365, Math.max(7, Number(new URL(req.url).searchParams.get('days')) || 30))
  try {
    const since = new Date(Date.now() - (days + 400) * 86_400_000).toISOString()
    // ponytail: capped at 20k rows; past that, move to a nightly snapshot collection.
    const subs = await (await billingSubscriptions())
      .find({ ends_at: { $gte: since } }, { projection: { _id: 0, id: 1, status: 1, started_at: 1, ends_at: 1, last_order_id: 1, trial_order_id: 1, plan_id: 1 } })
      .limit(20_000)
      .toArray()
    const orderIds = [...new Set(subs.map((s) => s.last_order_id).filter((x): x is string => !!x))]
    const orders = orderIds.length
      ? await (await billingOrders()).find({ id: { $in: orderIds } }, { projection: { _id: 0, id: 1, amount_paise: 1, currency: 1, interval: 1, plan_kind: 1 } }).toArray()
      : []
    const byId = new Map(orders.map((o) => [o.id, o]))
    const rows: MetricSub[] = subs.map((s) => {
      const o = s.last_order_id ? byId.get(s.last_order_id) : undefined
      return {
        id: s.id,
        status: s.status,
        started_at: s.started_at,
        ends_at: s.ends_at,
        amount_minor: o?.amount_paise ?? 0,
        currency: o?.currency ?? 'INR',
        interval: o?.interval === 'year' ? 'year' : 'month',
        trial: !!s.trial_order_id && s.trial_order_id === s.last_order_id,
      }
    })
    return NextResponse.json({ days, metrics: revenueMetrics(rows, new Date(), days), sampled: subs.length >= 20_000 })
  } catch (e) {
    console.error('[admin/billing/metrics]', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error_retry'), { status: 500 })
  }
}
