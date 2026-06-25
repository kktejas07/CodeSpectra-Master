'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
import { cn } from '@/lib/utils'
import { DashboardPageHeader } from '@/components/dashboard/dashboard-page-header'
import { findPlan } from '@/lib/billing-catalog'

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
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [cycleOpen, setCycleOpen] = useState(false)
  const [cardOpen, setCardOpen] = useState(false)
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

  const [pickPlan, setPickPlan] = useState('pro')
  const [pickInterval, setPickInterval] = useState<'month' | 'year'>('month')
  const [cardBrand, setCardBrand] = useState('Visa')
  const [cardLast4, setCardLast4] = useState('4242')
  const [cardExpM, setCardExpM] = useState(12)
  const [cardExpY, setCardExpY] = useState(2030)

  const load = useCallback(async () => {
    const [subRes, invRes, planRes, pmRes] = await Promise.all([
      fetch('/api/billing/subscription', { credentials: 'include' }),
      fetch('/api/billing/invoices', { credentials: 'include' }),
      fetch('/api/billing/plans', { credentials: 'include' }),
      fetch('/api/billing/payment-methods', { credentials: 'include' }),
    ])
    if (subRes.ok) {
      setSubscription(await subRes.json())
    } else {
      const pf = findPlan('free')
      setSubscription({
        planId: 'free',
        planName: pf.name,
        status: 'active',
        billingInterval: 'month',
        currentPeriodStart: null,
        currentPeriodEnd: null,
        canceledAt: null,
        pricePerMonth: 0,
        pricePerYear: 0,
        currentPrice: 0,
        features: pf.features,
        autoRenew: true,
        userEmail: '',
      })
    }
    if (invRes.ok) setInvoices(await invRes.json())
    if (planRes.ok) setPlans(await planRes.json())
    if (pmRes.ok) setPaymentMethods(await pmRes.json())
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        await load()
        if (!cancelled && searchParams.get('paid') === '1') {
          addToast({
            type: 'success',
            title: 'Payment recorded',
            message: 'Your plan is updated. Check your email for the receipt link.',
            duration: 6000,
          })
        }
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
          addToast({
            type: 'error',
            title: 'Could not load billing',
            message: e instanceof Error ? e.message : 'Error',
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [load, addToast, searchParams])

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
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan: pickPlan, interval: pickInterval }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Checkout failed')
      setUpgradeOpen(false)
      window.location.href = typeof j.url === 'string' ? j.url : '/dashboard/billing?paid=1'
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

  const changeCycle = async (interval: 'month' | 'year') => {
    setBusy('cycle')
    try {
      const res = await fetch('/api/billing/subscription', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ billingInterval: interval }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Update failed')
      setSubscription(j)
      setCycleOpen(false)
      addToast({ type: 'success', title: 'Billing cycle updated', message: `Renewal is now ${interval === 'year' ? 'annual' : 'monthly'}.` })
      await load()
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Could not update',
        message: e instanceof Error ? e.message : 'Failed',
      })
    } finally {
      setBusy(null)
    }
  }

  const cancelSub = async () => {
    setBusy('cancel')
    try {
      const res = await fetch('/api/billing/cancel', { method: 'POST', credentials: 'include' })
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

  const saveCard = async () => {
    if (!defaultPm) return
    setBusy('card')
    try {
      const res = await fetch(`/api/billing/payment-methods/${defaultPm.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          brand: cardBrand,
          last4: cardLast4,
          expMonth: cardExpM,
          expYear: cardExpY,
          isDefault: true,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Update failed')
      setCardOpen(false)
      addToast({ type: 'success', title: 'Payment method updated' })
      await load()
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Could not save card',
        message: e instanceof Error ? e.message : 'Failed',
      })
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    if (!defaultPm) return
    setCardBrand(defaultPm.brand || 'Card')
    setCardLast4(defaultPm.last4)
    setCardExpM(defaultPm.exp_month || 12)
    setCardExpY(defaultPm.exp_year || 2030)
  }, [defaultPm?.id])

  if (loading || !subscription) {
    return (
      <Card className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading billing…
      </Card>
    )
  }

  const isCanceled = subscription.status === 'canceled'
  const nextBill = subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
    : '—'

  return (
    <div className="space-y-8">
      <DashboardPageHeader
        icon={CreditCard}
        title="Billing & subscriptions"
        description="Upgrade, switch annual or monthly billing, manage your card on file, and download receipts. Checkout is simulated here; connect Stripe for production cards and webhooks."
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

      <Card className="rounded-xl border-primary/25 p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground">{subscription.planName}</h2>
            <p className="mt-1 text-muted-foreground">
              {subscription.billingInterval === 'year' ? 'Annual' : 'Monthly'} billing ·{' '}
              <span className="font-medium text-foreground">${subscription.currentPrice}</span>
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
              <p className="font-medium text-foreground">{nextBill}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Receipt email</p>
              <p className="font-medium text-foreground">{subscription.userEmail}</p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
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

      <div>
        <h3 className="mb-3 text-lg font-semibold tracking-tight text-foreground">Invoice history</h3>
        <Card className="overflow-hidden rounded-xl border-border/60 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
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
                      <td className="px-4 py-3">{inv.date}</td>
                      <td className="px-4 py-3">
                        ${inv.amount.toFixed(2)} {inv.currency}
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

      <Card className="rounded-xl border-border/60 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Payment method</h3>
            <p className="text-sm text-muted-foreground mt-1">Demo card on file — edit labels for your records.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setCardOpen(true)} disabled={!defaultPm || Boolean(busy)}>
            Edit card
          </Button>
        </div>
        {defaultPm ? (
          <div className="mt-4 flex items-center gap-4 rounded-lg border border-border bg-muted/20 p-4">
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
          <p className="mt-4 text-sm text-muted-foreground">No card on file.</p>
        )}
      </Card>

      {/* Upgrade */}
      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Change plan</DialogTitle>
            <DialogDescription>Pick a plan and billing interval. We&apos;ll record payment and email your receipt.</DialogDescription>
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
                    {p.name} — ${p.price}/mo (${p.yearlyPrice}/yr)
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
            <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void changeCycle('month')}>
              Monthly
            </Button>
            <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void changeCycle('year')}>
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

      {/* Card edit */}
      <Dialog open={cardOpen} onOpenChange={setCardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit payment method</DialogTitle>
            <DialogDescription>Demo only — does not charge a real card.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="brand">Brand</Label>
              <Input id="brand" value={cardBrand} onChange={(e) => setCardBrand(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last4">Last 4 digits</Label>
              <Input id="last4" value={cardLast4} onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} maxLength={4} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="em">Exp. month</Label>
                <Input id="em" type="number" min={1} max={12} value={cardExpM} onChange={(e) => setCardExpM(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ey">Exp. year</Label>
                <Input id="ey" type="number" value={cardExpY} onChange={(e) => setCardExpY(Number(e.target.value))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCardOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveCard()} disabled={Boolean(busy)}>
              {busy === 'card' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
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
                  ${invoiceDetail.amount.toFixed(2)} {invoiceDetail.currency}
                </strong>
              </p>
              <p>
                <span className="text-muted-foreground">Status:</span> {invoiceDetail.status}
              </p>
              <p>
                <span className="text-muted-foreground">Date:</span>{' '}
                {new Date(invoiceDetail.createdAt).toLocaleString()}
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
  return (
    <Suspense
      fallback={
        <Card className="flex items-center justify-center gap-2 rounded-xl border-border/60 py-20 text-muted-foreground shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading…
        </Card>
      }
    >
      <BillingContent />
    </Suspense>
  )
}
