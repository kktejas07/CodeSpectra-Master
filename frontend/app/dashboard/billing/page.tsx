'use client'
import { formatDateTime, formatDate } from '@/lib/format-datetime'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { CreditCard, Check, Download, Eye, Loader2, RefreshCw } from 'lucide-react'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { completeCheckout } from '@/lib/razorpay-checkout'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/app/page-kit'
import { findPlan } from '@/lib/billing-catalog'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { SkeletonStats, SkeletonTable, SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { getCurrencySymbol, formatCurrencyAmount } from '@/lib/currency'

type InvoiceRow = {
  id: string
  date: string
  amount: number
  currency: string
  status: string
  description: string | null
  downloadUrl: string | null
}

type Subscription = {
  planId: string
  planName: string
  status: string
  billingInterval: 'month' | 'year'
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  canceledAt: string | null
  pricePerMonth: number
  pricePerYear: number
  currentPrice: number
  features: string[]
  autoRenew: boolean
  userEmail: string
}

type Plan = {
  id: string
  name: string
  description: string
  price: number
  yearlyPrice: number
  features: string[]
  popular?: boolean
}

type PaymentMethod = {
  id: string
  brand: string | null
  last4: string
  exp_month: number | null
  exp_year: number | null
  is_default: boolean | null
}

function BillingContent() {
  const addToast = useToast()
  const searchParams = useSearchParams()
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [cycleOpen, setCycleOpen] = useState(false)
  const [invoiceView, setInvoiceView] = useState<InvoiceRow | null>(null)
  const [invoiceDetail, setInvoiceDetail] = useState<{
    id: string
    amount: number
    currency: string
    status: string
    description: string | null
    createdAt: string
    downloadUrl: string
  } | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const [currency, setCurrency] = useState('USD')
  useEffect(() => {
    fetch('/api/admin/platform-settings', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d?.settings?.platform_currency) setCurrency(d.settings.platform_currency) })
      .catch(() => {})
  }, [])

  const [pickPlan, setPickPlan] = useState('pro')
  const [pickInterval, setPickInterval] = useState<'month' | 'year'>('month')

  const load = useCallback(async () => {
    const [subRes, invRes, planRes, pmRes] = await Promise.all([
      fetch('/api/billing/subscription', { credentials: 'include' }),
      fetch('/api/billing/invoices', { credentials: 'include' }),
      fetch('/api/billing/plans', { credentials: 'include' }),
      fetch('/api/billing/payment-methods', { credentials: 'include' }),
    ])
    // Don't guess the plan when the server can't tell us — show an error instead.
    if (!subRes.ok) {
      const j = await subRes.json().catch(() => ({}))
      throw new Error(typeof j.error === 'string' && subRes.status !== 500 ? j.error : `Billing service returned ${subRes.status}`)
    }
    {
      const d = await subRes.json()
      const sub = d.subscription || d
      const plan = findPlan((sub as any).plan_id || (sub as any).planId || 'free')
      setSubscription({
        ...sub,
        planName: plan.name,
        features: plan.features,
        pricePerMonth: plan.monthlyUsd,
        pricePerYear: plan.yearlyUsd,
      })
    }
    if (invRes.ok) {
      // API returns { invoices: InvoiceView[] } (see lib/billing/invoice.ts).
      const d = await invRes.json()
      const list = Array.isArray(d?.invoices) ? d.invoices : []
      setInvoices(list.map((v: { id: string; createdAt: string; amount: number; currency: string; status: string; description: string | null; downloadUrl: string }) => ({
        id: v.id,
        date: formatDate(v.createdAt),
        amount: v.amount,
        currency: v.currency,
        status: v.status,
        description: v.description,
        downloadUrl: v.downloadUrl,
      })))
    }
    if (planRes.ok) { const d = await planRes.json(); setPlans(Array.isArray(d) ? d : []) }
    if (pmRes.ok) { const d = await pmRes.json(); setPaymentMethods(Array.isArray(d) ? d : []) }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadError(null)
      try {
        await load()
        if (!cancelled && searchParams.get('session_id')) {
          addToast({
            type: 'success',
            title: 'Checkout complete',
            message: 'Stripe is syncing your subscription. This may take a few seconds.',
            duration: 8000,
          })
          for (let i = 0; i < 6 && !cancelled; i++) {
            await new Promise((r) => setTimeout(r, 1500))
            await load()
          }
        }
        if (!cancelled && searchParams.get('canceled') === '1') {
          addToast({
            type: 'info',
            title: 'Checkout canceled',
            message: 'No charges were made. You can upgrade again anytime.',
          })
        }
        if (!cancelled && searchParams.get('error')) {
          addToast({
            type: 'error',
            title: 'Billing',
            message: 'Something went wrong during checkout. Try again or contact support.',
          })
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Something went wrong')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [load, addToast, searchParams, reloadKey])

  const defaultPm = paymentMethods.find((p) => p.is_default) || paymentMethods[0]

  const openInvoice = async (inv: InvoiceRow) => {
    setInvoiceView(inv)
    setBusy('invoice')
    try {
      const res = await fetch(`/api/billing/invoices/${inv.id}`, { credentials: 'include' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Failed')
      setInvoiceDetail(j)
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Invoice',
        message: e instanceof Error ? e.message : 'Failed to load',
      })
      setInvoiceView(null)
    } finally {
      setBusy(null)
    }
  }

  const runCheckout = async () => {
    setBusy('checkout')
    try {
      const serverPlanId = pickPlan === 'free'
        ? 'free'
        : pickPlan === 'enterprise'
          ? 'problem_pack_50'
          : pickInterval === 'year' ? 'pro_yearly' : 'pro_monthly'

      const res = await csrfFetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan_id: serverPlanId }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Checkout failed')
      // Redirect gateways leave the page; Razorpay opens its modal and resolves
      // 'paid' only after /api/billing/verify confirms the payment server-side.
      const outcome = await completeCheckout(j)
      if (outcome.status === 'paid') {
        setUpgradeOpen(false)
        addToast({ type: 'success', title: 'Payment confirmed', message: 'Your plan is updated.', duration: 6000 })
        await load()
      }
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Checkout',
        message: e instanceof Error ? e.message : 'Failed',
      })
    } finally {
      setBusy(null)
    }
  }

  // Switching monthly <-> annual is a new paid purchase, so it goes through
  // checkout (the server no longer lets the client set a paid plan directly).
  const changeCycle = (interval: 'month' | 'year') => {
    setPickInterval(interval)
    setCycleOpen(false)
    setUpgradeOpen(true)
  }

  const cancelSub = async () => {
    setBusy('cancel')
    try {
      const res = await csrfFetch('/api/billing/cancel', { method: 'POST', credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Cancel failed')
      setCancelOpen(false)
      addToast({ type: 'success', title: 'Subscription canceled', message: 'Access continues until the period end shown below.' })
      await load()
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Cancel failed',
        message: e instanceof Error ? e.message : 'Failed',
      })
    } finally {
      setBusy(null)
    }
  }

  if (!loading && (loadError || !subscription)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Billing" icon={<CreditCard aria-hidden />} />
        <Card role="alert" className="rounded-3xl border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
          <h2 className="text-lg font-semibold text-foreground">We couldn&apos;t load your billing details</h2>
          <p className="text-sm text-muted-foreground">
            {loadError ? `${loadError}. ` : ''}Check your connection and try again. Nothing has been changed on your account.
          </p>
          <Button onClick={() => setReloadKey((k) => k + 1)} className="gap-2">
            <RefreshCw className="h-4 w-4" aria-hidden /> Try again
          </Button>
        </Card>
      </div>
    )
  }

  if (loading || !subscription) {
    return (
      <div className="space-y-8">
        <SkeletonCard />
        <SkeletonStats />
        <SkeletonTable rows={3} />
        <SkeletonCard />
      </div>
    )
  }

  const isCanceled = subscription.status === 'canceled'
  const nextBill = subscription.currentPeriodEnd
    ? formatDate(subscription.currentPeriodEnd)
    : '—'

  return (
    <div className="space-y-6">
      <div data-tour="billing-header">
      <PageHeader
        className="mb-0"
        icon={<CreditCard aria-hidden />}
        title="Billing & subscriptions"
        description="Upgrade, change billing cycle, manage payment methods, and download receipts."
        actions={
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-2 rounded-lg"
            onClick={() => void load()}
            disabled={Boolean(busy)}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />
      </div>

      <Card className="rounded-3xl border-primary/25 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground">{subscription.planName}</h2>
            <p className="mt-1 text-muted-foreground">
              {subscription.billingInterval === 'year' ? 'Annual' : 'Monthly'} billing ·{' '}
              <span className="font-medium tabular-nums text-foreground">{getCurrencySymbol(currency)}{subscription.currentPrice}</span>
              {subscription.billingInterval === 'year' ? '/year' : '/month'}
            </p>
            {subscription.canceledAt ? (
              <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
                Canceled — access until {nextBill}
              </p>
            ) : null}
          </div>
          <Badge className={isCanceled ? 'bg-muted text-muted-foreground' : 'bg-green-500/15 text-green-800 dark:text-green-400'}>
            {isCanceled ? 'Canceled' : subscription.status}
          </Badge>
        </div>

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="font-semibold text-foreground mb-3">Included</h3>
            <ul className="space-y-2">
              {subscription.features.map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Check className="h-4 w-4 shrink-0 text-green-600" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">Next renewal</p>
              <p className="font-medium tabular-nums text-foreground">{nextBill}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Receipt email</p>
              <p className="font-medium text-foreground">{subscription.userEmail}</p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-2" data-tour="billing-actions">
          <Button onClick={() => setUpgradeOpen(true)} disabled={Boolean(busy) || isCanceled}>
            Upgrade / change plan
          </Button>
          <Button variant="outline" onClick={() => setCycleOpen(true)} disabled={Boolean(busy) || isCanceled || subscription.planId === 'free'}>
            Change billing cycle
          </Button>
          <Button variant="outline" onClick={() => setCancelOpen(true)} disabled={Boolean(busy) || isCanceled || subscription.planId === 'free'}>
            Cancel subscription
          </Button>
        </div>
      </Card>

      <div data-tour="billing-invoices">
        <h3 className="mb-3 text-lg font-semibold tracking-tight text-foreground">Invoice history</h3>
        <Card className="overflow-hidden rounded-3xl border-border/70">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Invoice</th>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-left font-medium">Amount</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                      No invoices yet. Complete a plan change to generate a receipt.
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">{inv.id.slice(0, 8)}…</td>
                      <td className="px-4 py-3 tabular-nums">{inv.date}</td>
                      <td className="px-4 py-3 tabular-nums">
                          {getCurrencySymbol(inv.currency || currency)}{inv.amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="capitalize">
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right space-x-1">
                        <Button variant="ghost" size="sm" className="gap-1" onClick={() => void openInvoice(inv)}>
                          <Eye className="h-4 w-4" />
                          View
                        </Button>
                        <Button variant="ghost" size="sm" className="gap-1" asChild>
                          <a href={inv.downloadUrl || `/api/billing/invoices/${inv.id}/download`} target="_blank" rel="noreferrer">
                            <Download className="h-4 w-4" />
                            Download
                          </a>
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card className="rounded-3xl border-border/70 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Payment method</h3>
            <p className="text-sm text-muted-foreground mt-1">The card used for your subscription renewals.</p>
          </div>
          {/* Cards are managed by the payment gateway at checkout; there's no
              server route to edit one here, so no edit button. */}
        </div>
        {defaultPm ? (
          <div className="mt-4 flex items-center gap-4 rounded-2xl border border-border/70 bg-muted/20 p-4">
            <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded bg-linear-to-r from-slate-700 to-slate-900 text-[10px] font-bold text-white">
              {(defaultPm.brand || 'CARD').slice(0, 4).toUpperCase()}
            </div>
            <div>
              <p className="font-medium text-foreground">
                •••• •••• •••• {defaultPm.last4}
              </p>
              <p className="text-xs text-muted-foreground">
                Expires {defaultPm.exp_month}/{defaultPm.exp_year}
                {defaultPm.is_default ? ' · Default' : ''}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No card on file. Your card is saved by the payment provider when you pay for a plan.</p>
        )}
      </Card>

      {/* Upgrade */}
      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Change plan</DialogTitle>
            <DialogDescription>Pick a plan and billing interval. Your plan changes once the payment is confirmed.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Plan</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={pickPlan}
                onChange={(e) => setPickPlan(e.target.value)}
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.id === 'free'}>
                    {p.name} — {getCurrencySymbol(currency)}{p.price}/mo ({getCurrencySymbol(currency)}{p.yearlyPrice}/yr)
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Billing interval</Label>
              <div className="flex gap-2">
                {(['month', 'year'] as const).map((iv) => (
                  <Button
                    key={iv}
                    type="button"
                    variant={pickInterval === iv ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPickInterval(iv)}
                  >
                    {iv === 'year' ? 'Annual (save ~15%)' : 'Monthly'}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpgradeOpen(false)}>
              Close
            </Button>
            <Button onClick={() => void runCheckout()} disabled={Boolean(busy) || pickPlan === 'free'}>
              {busy === 'checkout' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Pay & activate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Billing cycle */}
      <Dialog open={cycleOpen} onOpenChange={setCycleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Billing cycle</DialogTitle>
            <DialogDescription>Switch between monthly and annual renewal.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 py-2">
            <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => changeCycle('month')}>
              Monthly
            </Button>
            <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => changeCycle('year')}>
              Annual
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCycleOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice view */}
      <Dialog
        open={Boolean(invoiceView)}
        onOpenChange={(o) => {
          if (!o) {
            setInvoiceView(null)
            setInvoiceDetail(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invoice</DialogTitle>
            <DialogDescription>Summary for your records.</DialogDescription>
          </DialogHeader>
          {invoiceDetail ? (
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Amount:</span>{' '}
                <strong>
                  {getCurrencySymbol(invoiceDetail.currency || currency)}{invoiceDetail.amount.toFixed(2)} {invoiceDetail.currency}
                </strong>
              </p>
              <p>
                <span className="text-muted-foreground">Status:</span> {invoiceDetail.status}
              </p>
              <p>
                <span className="text-muted-foreground">Date:</span>{' '}
                {formatDateTime(invoiceDetail.createdAt)}
              </p>
              {invoiceDetail.description ? (
                <p>
                  <span className="text-muted-foreground">Description:</span> {invoiceDetail.description}
                </p>
              ) : null}
              <Button className="mt-4 w-full gap-2" variant="outline" asChild>
                <a href={invoiceDetail.downloadUrl} target="_blank" rel="noreferrer">
                  <Download className="h-4 w-4" />
                  Download receipt
                </a>
              </Button>
            </div>
          ) : (
            <div className="flex justify-center py-8 text-muted-foreground">
              {busy === 'invoice' ? <Loader2 className="h-6 w-6 animate-spin" /> : null}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              You keep access until the end of the current period. You can resubscribe anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep plan</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void cancelSub()
              }}
            >
              {busy === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirm cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function BillingPage() {
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready) {
      const billingTour: TourStep[] = [
        {
          target: '[data-tour="billing-header"]',
          title: 'Billing central hub',
          description: 'Manage your subscription, payment method, and receipts in one place.',
          position: 'bottom',
        },
        {
          target: '[data-tour="billing-actions"]',
          title: 'Adjust subscription here',
          description: 'Start plan upgrades, cycle switches, or cancellation while keeping access until period end.',
          position: 'bottom',
        },
        {
          target: '[data-tour="billing-invoices"]',
          title: 'Download receipts quickly',
          description: 'Tip: open View for invoice details or use Download to save receipts.',
          position: 'top',
        },
      ]
      autoPlayPageTour('billing', billingTour)}
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready) return null

  return (
    <Suspense
      fallback={
        <div className="space-y-8">
          <SkeletonCard />
          <SkeletonStats />
          <SkeletonTable rows={3} />
          <SkeletonCard />
        </div>
      }
    >
      <BillingContent />
    </Suspense>
  )
}

