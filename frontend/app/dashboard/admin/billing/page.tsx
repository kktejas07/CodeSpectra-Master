'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Loader2, DollarSign, Users, TrendingUp, Activity } from 'lucide-react'
import { SkeletonStats, SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { usePageGuard } from '@/lib/use-page-guard'
import { getCurrencySymbol } from '@/lib/currency'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'

interface BillingStats {
  active_subscriptions: number
  cancelled_subscriptions: number
  total_subscriptions: number
  total_revenue_paise: number
  usd_revenue_paise: number
  inr_revenue_paise: number
  mrr_paise: number
}

interface PlanOrder {
  _id: string
  count: number
  total: number
}

export default function AdminBillingPage() {
  const gate = usePageGuard('superadmin')
  const [stats, setStats] = useState<BillingStats | null>(null)
  const [plans, setPlans] = useState<PlanOrder[]>([])
  const [revenueByDay, setRevenueByDay] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState('USD')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/billing-stats', { cache: 'no-store' })
      if (res.ok) {
        const j = await res.json()
        setStats(j.stats)
        setPlans(j.orders_by_plan || [])
        setRevenueByDay(j.revenue_by_day || {})
      }
    } catch {} finally { setLoading(false) }
  }, [])

  const loadCurrency = async () => {
    try {
      const res = await fetch('/api/admin/platform-settings', { credentials: 'include' })
      const data = await res.json()
      if (data?.settings?.platform_currency) setCurrency(data.settings.platform_currency)
    } catch {}
  }

  useEffect(() => { if (gate.ready) { void load(); void loadCurrency() } }, [gate.ready, load])

  const fmt = (paise: number, currencyArg?: string) => {
    const amt = paise / 100
    const c = (currencyArg || currency).toUpperCase()
    return `${getCurrencySymbol(c)}${amt.toLocaleString(c === 'INR' ? 'en-IN' : 'en-US', { minimumFractionDigits: 2 })}`
  }

  if (!gate.ready) return null
  if (loading) return <div className="space-y-6"><SkeletonStats /><SkeletonCard /><div className="grid gap-4 md:grid-cols-2"><SkeletonCard /><SkeletonCard /></div></div>

  const revDays = Object.entries(revenueByDay).sort(([a], [b]) => a.localeCompare(b))
  const maxRev = Math.max(...revDays.map(([, v]) => v), 1)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing analytics"
        description="Subscriptions, recurring revenue and cancellations across all organizations."
        icon={<DollarSign />}
      />

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active subscriptions" value={stats?.active_subscriptions || 0} icon={<Users />} />
        <StatCard label="Monthly recurring revenue" value={fmt(stats?.mrr_paise || 0)} icon={<TrendingUp />} />
        <Panel className="flex items-center gap-4 p-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <DollarSign className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">Total revenue</p>
            <p className="text-lg font-bold tabular-nums text-foreground">{fmt(stats?.usd_revenue_paise || 0)} <span className="text-xs font-normal text-muted-foreground">USD</span></p>
            <p className="text-lg font-bold tabular-nums text-foreground">{fmt(stats?.inr_revenue_paise || 0, 'INR')} <span className="text-xs font-normal text-muted-foreground">INR</span></p>
          </div>
        </Panel>
        <StatCard
          label="Churn"
          value={stats && (stats.active_subscriptions + stats.cancelled_subscriptions) > 0
            ? `${Math.round(stats.cancelled_subscriptions / (stats.active_subscriptions + stats.cancelled_subscriptions) * 100)}%`
            : '0%'}
          hint="Cancelled out of all subscriptions"
          icon={<Activity />}
        />
      </div>

      {/* Revenue Chart (bar chart) */}
      <Panel>
        <h2 className="mb-4 text-base font-semibold text-foreground">Revenue, last 30 days</h2>
        {revDays.length === 0 ? (
          <p className="text-sm text-muted-foreground">No revenue yet. Paid orders will show here day by day.</p>
        ) : (
          <div className="flex items-end gap-1 h-32">
            {revDays.map(([day, amount]) => (
              <div key={day} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] tabular-nums text-muted-foreground">{fmt(amount)}</span>
                <div
                  className="w-full min-h-[4px] rounded-t-md bg-primary/60 transition-colors duration-200 hover:bg-primary"
                  style={{ height: `${(amount / maxRev) * 100}%` }}
                />
                <span className="text-[10px] tabular-nums text-muted-foreground">{day.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Orders by Plan */}
        <Panel>
          <h2 className="mb-4 text-base font-semibold text-foreground">Orders by plan</h2>
          {plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders yet.</p>
          ) : (
            <div className="space-y-2">
              {plans.map((p) => (
                <div key={p._id} className="flex items-center justify-between text-sm">
                  <Badge variant="outline">{p._id || 'unknown'}</Badge>
                  <span className="tabular-nums text-foreground">{p.count} orders · {fmt(p.total)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Subscription Status */}
        <Panel>
          <h2 className="mb-4 text-base font-semibold text-foreground">Subscription status</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Active</span>
              <span className="font-bold tabular-nums text-green-600 dark:text-green-400">{stats?.active_subscriptions || 0}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Cancelled</span>
              <span className="font-bold tabular-nums text-destructive">{stats?.cancelled_subscriptions || 0}</span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
              <span>Total</span>
              <span className="font-bold tabular-nums">{stats?.total_subscriptions || 0}</span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
