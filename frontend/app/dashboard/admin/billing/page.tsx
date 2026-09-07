'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, DollarSign, Users, TrendingUp, Activity } from 'lucide-react'
import { SkeletonStats, SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { usePageGuard } from '@/lib/use-page-guard'
import { getCurrencySymbol } from '@/lib/currency'

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
      <h1 className="text-3xl font-bold flex items-center gap-2">
        <DollarSign className="h-7 w-7 text-primary" /> Billing Analytics
      </h1>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Users className="h-4 w-4" /> Active Subscriptions
          </div>
          <p className="text-3xl font-bold">{stats?.active_subscriptions || 0}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <TrendingUp className="h-4 w-4" /> MRR
          </div>
          <p className="text-3xl font-bold">{fmt(stats?.mrr_paise || 0)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <DollarSign className="h-4 w-4" /> Total Revenue
          </div>
          <p className="text-lg font-bold">{fmt(stats?.usd_revenue_paise || 0)} <span className="text-xs text-muted-foreground font-normal">USD</span></p>
          <p className="text-lg font-bold">{fmt(stats?.inr_revenue_paise || 0, 'INR')} <span className="text-xs text-muted-foreground font-normal">INR</span></p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Activity className="h-4 w-4" /> Churn
          </div>
          <p className="text-3xl font-bold">
            {stats && (stats.active_subscriptions + stats.cancelled_subscriptions) > 0
              ? `${Math.round(stats.cancelled_subscriptions / (stats.active_subscriptions + stats.cancelled_subscriptions) * 100)}%`
              : '0%'}
          </p>
        </Card>
      </div>

      {/* Revenue Chart (bar chart) */}
      <Card className="p-6">
        <h2 className="text-sm font-semibold mb-4">Revenue — Last 30 Days</h2>
        {revDays.length === 0 ? (
          <p className="text-sm text-muted-foreground">No revenue data yet.</p>
        ) : (
          <div className="flex items-end gap-1 h-32">
            {revDays.map(([day, amount]) => (
              <div key={day} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[9px] text-muted-foreground">{fmt(amount)}</span>
                <div
                  className="w-full rounded-t bg-primary/60 hover:bg-primary transition-colors min-h-[4px]"
                  style={{ height: `${(amount / maxRev) * 100}%` }}
                />
                <span className="text-[8px] text-muted-foreground">{day.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Orders by Plan */}
        <Card className="p-6">
          <h2 className="text-sm font-semibold mb-4">Orders by Plan</h2>
          {plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">No plan data yet.</p>
          ) : (
            <div className="space-y-2">
              {plans.map((p) => (
                <div key={p._id} className="flex items-center justify-between text-sm">
                  <Badge variant="outline">{p._id || 'unknown'}</Badge>
                  <span>{p.count} orders · {fmt(p.total)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Subscription Status */}
        <Card className="p-6">
          <h2 className="text-sm font-semibold mb-4">Subscription Status</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Active</span>
              <span className="font-bold text-green-500">{stats?.active_subscriptions || 0}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Cancelled</span>
              <span className="font-bold text-destructive">{stats?.cancelled_subscriptions || 0}</span>
            </div>
            <div className="flex items-center justify-between text-sm border-t pt-2">
              <span>Total</span>
              <span className="font-bold">{stats?.total_subscriptions || 0}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
