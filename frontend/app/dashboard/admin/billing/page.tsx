'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, DollarSign, Users, TrendingUp, Activity, RefreshCw, Undo2 } from 'lucide-react'
import { SkeletonStats, SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { usePageGuard } from '@/lib/use-page-guard'
import { getCurrencySymbol } from '@/lib/currency'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { formatDate, formatDateTime } from '@/lib/format-datetime'
import { cn } from '@/lib/utils'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'

interface PaymentRow {
  id: string
  created_at: string
  status: 'paid' | 'refunded'
  amount: number
  currency: string
  plan_id: string
  plan_name: string | null
  user_email: string | null
  user_name: string | null
  gateway: string
  payment_ref: string | null
  funds_current_period: boolean
  refunded_at: string | null
  refunded_by_email: string | null
  refund_note: string | null
}

const REFUND_ACTION_LABEL = 'Mark as refunded (refund issued in Razorpay)'

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
  const addToast = useToast()
  const [payments, setPayments] = useState<PaymentRow[] | null>(null)
  const [paymentsError, setPaymentsError] = useState(false)
  const [paymentsFilter, setPaymentsFilter] = useState<'all' | 'paid' | 'refunded'>('all')
  const [refundTarget, setRefundTarget] = useState<PaymentRow | null>(null)
  const [refundNote, setRefundNote] = useState('')
  const [refundConfirmed, setRefundConfirmed] = useState(false)
  const [refunding, setRefunding] = useState(false)
  const [refundError, setRefundError] = useState<string | null>(null)

  const loadPayments = useCallback(async () => {
    setPaymentsError(false)
    try {
      const res = await fetch(`/api/billing/admin/orders?status=${paymentsFilter}`, { cache: 'no-store', credentials: 'include' })
      if (!res.ok) throw new Error('load')
      const j = await res.json()
      setPayments(Array.isArray(j.items) ? j.items : [])
    } catch {
      setPaymentsError(true)
      setPayments([])
    }
  }, [paymentsFilter])

  useEffect(() => { if (gate.ready) void loadPayments() }, [gate.ready, loadPayments])

  const openRefund = (row: PaymentRow) => {
    setRefundTarget(row)
    setRefundNote('')
    setRefundConfirmed(false)
    setRefundError(null)
  }

  const submitRefund = async () => {
    if (!refundTarget) return
    const note = refundNote.trim()
    if (note.length < 5) { setRefundError('Add a note of at least 5 characters.'); return }
    if (!refundConfirmed) { setRefundError('Confirm the refund was issued in Razorpay.'); return }
    setRefunding(true)
    setRefundError(null)
    try {
      const res = await csrfFetch(`/api/billing/admin/orders/${encodeURIComponent(refundTarget.id)}/refund`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note, confirm: true }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Could not record the refund')
      addToast({
        type: 'success',
        title: 'Marked as refunded',
        message: j.downgraded ? 'The user is now on the Free plan.' : 'The payment is recorded as refunded.',
      })
      setRefundTarget(null)
      await Promise.all([loadPayments(), load()])
    } catch (e) {
      setRefundError(e instanceof Error ? e.message : 'Could not record the refund')
    } finally {
      setRefunding(false)
    }
  }

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
        illustration="billing"
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

      {/* Payments + manual refund record */}
      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Payments</h2>
            <p className="text-sm text-muted-foreground">
              Issue refunds in the Razorpay dashboard first, then record them here. This does not move any money.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full border border-border bg-card p-1" role="group" aria-label="Filter payments">
              {(['all', 'paid', 'refunded'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={paymentsFilter === f}
                  onClick={() => setPaymentsFilter(f)}
                  className={cn(
                    'min-h-8 rounded-full px-3 text-xs font-medium capitalize transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-primary',
                    paymentsFilter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => void loadPayments()} aria-label="Refresh payments">
              <RefreshCw className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>

        {payments === null ? (
          <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading payments" /></div>
        ) : paymentsError ? (
          <EmptyState compact illustration="error" title="We couldn't load payments" description="Check your connection and try again." actionLabel="Try again" onAction={() => void loadPayments()} />
        ) : payments.length === 0 ? (
          <EmptyState compact illustration="billing" title="No payments yet" description="Paid and refunded orders will show here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Customer</th>
                  <th className="py-2 pr-3 font-medium">Plan</th>
                  <th className="py-2 pr-3 font-medium">Amount</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 align-top">
                    <td className="py-3 pr-3 tabular-nums">{formatDate(p.created_at)}</td>
                    <td className="py-3 pr-3">
                      <p className="text-foreground">{p.user_name || p.user_email || 'Unknown user'}</p>
                      {p.user_name && p.user_email ? <p className="text-xs text-muted-foreground">{p.user_email}</p> : null}
                      {p.payment_ref ? <p className="font-mono text-xs text-muted-foreground">{p.payment_ref}</p> : null}
                    </td>
                    <td className="py-3 pr-3">{p.plan_name || p.plan_id}</td>
                    <td className="py-3 pr-3 tabular-nums">{fmt(Math.round(p.amount * 100), p.currency)}</td>
                    <td className="py-3 pr-3">
                      <Badge
                        variant="outline"
                        className={cn('capitalize', p.status === 'refunded' ? 'border-amber-500/40 text-amber-700 dark:text-amber-400' : 'border-green-500/40 text-green-700 dark:text-green-400')}
                      >
                        {p.status}
                      </Badge>
                      {p.status === 'refunded' && p.refunded_at ? (
                        <p className="mt-1 max-w-56 text-xs text-muted-foreground">
                          {formatDateTime(p.refunded_at)}{p.refunded_by_email ? ` by ${p.refunded_by_email}` : ''}
                          {p.refund_note ? <span className="block">“{p.refund_note}”</span> : null}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-3 text-right">
                      {p.status === 'paid' && p.amount > 0 ? (
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => openRefund(p)}>
                          <Undo2 className="h-4 w-4" aria-hidden /> {REFUND_ACTION_LABEL}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Dialog open={!!refundTarget} onOpenChange={(o) => { if (!o && !refunding) setRefundTarget(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mark payment as refunded?</DialogTitle>
            <DialogDescription>
              This only records a refund you already issued in Razorpay. It does not send money back.
            </DialogDescription>
          </DialogHeader>
          {refundTarget ? (
            <div className="space-y-4 py-2 text-sm">
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <p className="font-medium text-foreground">
                  {fmt(Math.round(refundTarget.amount * 100), refundTarget.currency)} · {refundTarget.plan_name || refundTarget.plan_id}
                </p>
                <p className="text-muted-foreground">{refundTarget.user_email || 'Unknown user'} · {formatDate(refundTarget.created_at)}</p>
                <p className="mt-2 text-muted-foreground">
                  {refundTarget.funds_current_period
                    ? 'This payment covers the current period, so the user moves to the Free plan right away.'
                    : 'This payment does not cover the current period, so the user keeps their current access.'}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="refund-note">Reason (required)</Label>
                <Textarea
                  id="refund-note"
                  value={refundNote}
                  onChange={(e) => setRefundNote(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="For example: duplicate charge, refund rfnd_… issued on 12 Oct"
                />
              </div>
              <div className="flex items-start gap-2">
                <Checkbox id="refund-confirm" checked={refundConfirmed} onCheckedChange={(v) => setRefundConfirmed(v === true)} />
                <Label htmlFor="refund-confirm" className="font-normal leading-snug">
                  I issued this refund in the Razorpay dashboard.
                </Label>
              </div>
              {refundError ? <p role="alert" className="text-destructive">{refundError}</p> : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundTarget(null)} disabled={refunding}>Cancel</Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void submitRefund()}
              disabled={refunding || refundNote.trim().length < 5 || !refundConfirmed}
            >
              {refunding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
              Mark as refunded
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
