'use client'
import { EmptyState } from '@/components/ui/empty-state'
import { useLocaleDates } from '@/lib/i18n/use-dates'

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
import { AlertTriangle, CreditCard, Check, Download, ExternalLink, Eye, Loader2, RefreshCw } from 'lucide-react'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { completeCheckout } from '@/lib/razorpay-checkout'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/app/page-kit'
import { CONTACT_SALES_HREF, planCheckoutMode, type PlanCheckoutMode } from '@/lib/billing-plan-mode'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { SkeletonStats, SkeletonTable, SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { getCurrencySymbol, formatCurrencyAmount } from '@/lib/currency'
import { useCurrency } from '@/lib/use-currency'
import { Illustration } from '@/components/illustrations/spot'
import { useT } from '@/lib/i18n/client'

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
  /** 'stripe' = Stripe renews it and holds the card. */
  provider: 'stripe' | null
  pastDue: boolean
  graceEndsAt: string | null
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
  checkout_mode?: PlanCheckoutMode
  currency?: string | null
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
  const { formatDate, formatDateTime } = useLocaleDates()
  const { t } = useT()
  const addToast = useToast()
  const searchParams = useSearchParams()
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [invoicesError, setInvoicesError] = useState(false)
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
    refundedAt?: string | null
  } | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  // Platform currency from the public settings endpoint (the admin one is
  // superadmin-only); the subscription's own currency overrides it below.
  const { currency: platformCurrency } = useCurrency()
  const [subCurrency, setCurrency] = useState<string | null>(null)
  const currency = subCurrency || platformCurrency

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
      throw new Error(typeof j.error === 'string' && subRes.status !== 500 ? j.error : t('account.billingServiceReturnedStatus', { status: subRes.status }))
    }
    let planList: Plan[] = []
    if (planRes.ok) { const d = await planRes.json(); planList = Array.isArray(d) ? d : []; setPlans(planList) }
    {
      // GET /api/billing/subscription → { subscription: {...} | null, user_email }
      const d = await subRes.json()
      const sub = d.subscription as {
        plan_id: string; plan_name?: string; status: string; starts_at?: string; ends_at?: string
        interval?: 'month' | 'year'; amount?: number | null; currency?: string | null
        cancel_at_period_end?: boolean; cancelled_at?: string | null
        provider?: 'stripe' | null; auto_renew?: boolean; past_due?: boolean; grace_ends_at?: string | null
      } | null
      const planId = sub?.plan_id || 'free'
      const catalog = planList.find((p) => p.id === planId)
      const iv = sub?.interval === 'year' ? 'year' : 'month'
      if (sub?.currency) setCurrency(sub.currency)
      setSubscription({
        planId,
        planName: sub?.plan_name || catalog?.name || (sub ? planId : 'Free'),
        status: sub?.status || 'free',
        billingInterval: iv,
        currentPeriodStart: sub?.starts_at || null,
        currentPeriodEnd: sub?.ends_at || null,
        canceledAt: sub?.cancel_at_period_end ? (sub.cancelled_at || sub.ends_at || null) : null,
        pricePerMonth: catalog?.price ?? 0,
        pricePerYear: catalog?.yearlyPrice ?? 0,
        currentPrice: sub?.amount ?? (iv === 'year' ? catalog?.yearlyPrice : catalog?.price) ?? 0,
        features: catalog?.features ?? [],
        autoRenew: sub?.auto_renew === true,
        provider: sub?.provider === 'stripe' ? 'stripe' : null,
        pastDue: sub?.past_due === true,
        graceEndsAt: sub?.grace_ends_at || null,
        userEmail: typeof d.user_email === 'string' ? d.user_email : '',
      })
    }
    setInvoicesError(!invRes.ok)
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
    // API returns { methods }; only real saved cards (with last4) are shown.
    if (pmRes.ok) {
      const d = await pmRes.json()
      const list: PaymentMethod[] = Array.isArray(d?.methods) ? d.methods : []
      setPaymentMethods(list.filter((m) => typeof m.last4 === 'string' && m.last4.length > 0))
    }
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
            title: t('account.checkoutComplete'),
            message: t('account.stripeIsSyncingYourSubscriptionThisffa'),
            duration: 8000,
          })
          for (let i = 0; i < 6 && !cancelled; i++) {
            await new Promise((r) => setTimeout(r, 1500))
            await load()
          }
        }
        // PhonePe return: the server already re-checked the status; poll while pending.
        const phonepeStatus = searchParams.get('payment') === 'phonepe' ? searchParams.get('status') : null
        if (!cancelled && phonepeStatus === 'success') {
          addToast({ type: 'success', title: t('account.paymentConfirmed'), message: t('account.yourPlanIsUpdated') })
        } else if (!cancelled && phonepeStatus === 'pending') {
          addToast({ type: 'info', title: t('account.paymentPending'), message: t('account.phonepeIsStillConfirmingThePayment2d5'), duration: 8000 })
          for (let i = 0; i < 6 && !cancelled; i++) {
            await new Promise((r) => setTimeout(r, 2500))
            await load()
          }
        } else if (!cancelled && phonepeStatus === 'failed') {
          addToast({ type: 'error', title: t('account.paymentNotCompleted'), message: t('account.noPlanChangeWasMadeYou85b') })
        }
        if (!cancelled && searchParams.get('canceled') === '1') {
          addToast({
            type: 'info',
            title: t('account.checkoutCanceled'),
            message: t('account.noChargesWereMadeYouCan91f'),
          })
        }
        if (!cancelled && searchParams.get('error')) {
          addToast({
            type: 'error',
            title: t('account.billing'),
            message: t('account.somethingWentWrongDuringCheckoutTry485'),
          })
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : t('account.somethingWentWrong'))
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
  const modeOf = (p: Plan): PlanCheckoutMode =>
    p.checkout_mode ?? planCheckoutMode({ id: p.id, price: p.price, yearlyPrice: p.yearlyPrice })
  const pickedPlanRow = plans.find((p) => p.id === pickPlan)
  const pickedMode: PlanCheckoutMode = pickedPlanRow ? modeOf(pickedPlanRow) : 'free'

  // Default the plan picker to the first plan that can actually be bought.
  useEffect(() => {
    if (plans.length && !plans.some((p) => p.id === pickPlan && modeOf(p) === 'checkout')) {
      const first = plans.find((p) => modeOf(p) === 'checkout')
      if (first) setPickPlan(first.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans])

  const openInvoice = async (inv: InvoiceRow) => {
    setInvoiceView(inv)
    setBusy('invoice')
    try {
      const res = await fetch(`/api/billing/invoices/${inv.id}`, { credentials: 'include' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || t('account.failed'))
      setInvoiceDetail(j)
    } catch (e) {
      addToast({
        type: 'error',
        title: t('account.invoice'),
        message: e instanceof Error ? e.message : t('account.failedToLoad'),
      })
      setInvoiceView(null)
    } finally {
      setBusy(null)
    }
  }

  const runCheckout = async () => {
    setBusy('checkout')
    try {
      // Every paid plan checks out as itself; free / contact-sales never reach checkout.
      const res = await csrfFetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan_id: pickPlan, interval: pickInterval }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.status === 409 && j.code === 'contact_sales') {
        window.location.href = CONTACT_SALES_HREF
        return
      }
      if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : t('account.checkoutFailed'))
      // Redirect gateways leave the page; Razorpay opens its modal and resolves
      // 'paid' only after /api/billing/verify confirms the payment server-side.
      const outcome = await completeCheckout(j)
      if (outcome.status === 'paid') {
        setUpgradeOpen(false)
        addToast({ type: 'success', title: t('account.paymentConfirmed'), message: t('account.yourPlanIsUpdated'), duration: 6000 })
        await load()
      }
    } catch (e) {
      addToast({
        type: 'error',
        title: t('account.checkout'),
        message: e instanceof Error ? e.message : t('account.failed'),
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
      if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : t('account.cancelFailed'))
      setCancelOpen(false)
      addToast({ type: 'success', title: t('account.subscriptionCancelled'), message: t('account.accessContinuesUntilThePeriodEnd9ec') })
      await load()
    } catch (e) {
      addToast({
        type: 'error',
        title: t('account.cancelFailed'),
        message: e instanceof Error ? e.message : t('account.failed'),
      })
    } finally {
      setBusy(null)
    }
  }

  const resumeSub = async () => {
    setBusy('resume')
    try {
      const res = await csrfFetch('/api/billing/cancel', { method: 'DELETE', credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : t('account.couldNotResume'))
      addToast({ type: 'success', title: t('account.planKept'), message: t('account.yourCancellationWasUndone') })
      await load()
    } catch (e) {
      addToast({ type: 'error', title: t('account.resumeFailed'), message: e instanceof Error ? e.message : t('account.failed') })
    } finally {
      setBusy(null)
    }
  }

  // Stripe-hosted page to update the card (Stripe subscriptions only).
  const openPortal = async () => {
    setBusy('portal')
    try {
      const res = await csrfFetch('/api/billing/portal', { method: 'POST', credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || typeof j.url !== 'string') throw new Error(typeof j.error === 'string' ? j.error : t('account.couldNotOpenPaymentSettings'))
      window.location.href = j.url
    } catch (e) {
      addToast({ type: 'error', title: t('account.paymentMethod'), message: e instanceof Error ? e.message : t('account.failed') })
      setBusy(null)
    }
  }

  if (!loading && (loadError || !subscription)) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('account.billing')} icon={<CreditCard aria-hidden />} />
        <Card role="alert" className="rounded-3xl border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
          <Illustration name="error" className="mx-auto w-36" />
          <h2 className="text-lg font-semibold text-foreground">{t('account.weCouldntLoadYourBillingDetails')}</h2>
          <p className="text-sm text-muted-foreground">
            {loadError ? `${loadError}. ` : ''}{t('account.checkYourConnectionAndTryAgain004')}</p>
          <Button onClick={() => setReloadKey((k) => k + 1)} className="gap-2">
            <RefreshCw className="h-4 w-4" aria-hidden />{' '}{t('common.tryAgain')}</Button>
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

  // Cancelled at period end: still active, access until currentPeriodEnd.
  const isCanceled = Boolean(subscription.canceledAt)
  const nextBill = subscription.currentPeriodEnd
    ? formatDate(subscription.currentPeriodEnd)
    : '—'

  return (
    <div className="space-y-6">
      <div data-tour="billing-header">
      <PageHeader
        illustration="billing"
        className="mb-0"
        icon={<CreditCard aria-hidden />}
        title={t('account.billingSubscriptions')}
        description={t('account.upgradeChangeBillingCycleManagePayment5a9')}
        actions={
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-2 rounded-lg"
            onClick={() => void load()}
            disabled={Boolean(busy)}
          >
            <RefreshCw className="h-4 w-4" />{t('account.refresh')}</Button>
        }
      />
      </div>

      <Card className="rounded-3xl border-primary/25 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground">{subscription.planName}</h2>
            <p className="mt-1 text-muted-foreground">{t('account.valueBilling', { value: subscription.billingInterval === 'year' ? t('account.annual') : t('account.monthly') })}{' '}<span className="font-medium tabular-nums text-foreground">{getCurrencySymbol(currency)}{subscription.currentPrice}</span>
              {subscription.billingInterval === 'year' ? '/year' : '/month'}
            </p>
            {subscription.canceledAt ? (
              <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">{t('account.cancelledAccessUntilNextbill', { nextBill })}</p>
            ) : subscription.autoRenew && !subscription.pastDue ? (
              <p className="mt-2 text-sm text-muted-foreground">{t('account.renewsAutomaticallyOnNextbill', { nextBill })}</p>
            ) : null}
          </div>
          <Badge className={subscription.pastDue ? 'bg-destructive/15 text-destructive' : isCanceled ? 'bg-muted text-muted-foreground' : 'bg-green-500/15 text-green-800 dark:text-green-400'}>
            {subscription.pastDue ? t('account.pastDue') : isCanceled ? t('account.cancelling') : subscription.status}
          </Badge>
        </div>

        {subscription.pastDue ? (
          <div role="alert" className="mt-6 flex flex-wrap items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{t('account.yourLastRenewalPaymentFailed')}</p>
              <p className="text-sm text-muted-foreground">{t('account.updateYourPaymentMethodBy')}{' '}{subscription.graceEndsAt ? formatDate(subscription.graceEndsAt) : nextBill}{' '}{t('account.toKeepYourPlanWellRetry84b')}</p>
            </div>
            {subscription.provider === 'stripe' ? (
              <Button size="sm" onClick={() => void openPortal()} disabled={Boolean(busy)} className="gap-2">
                {busy === 'portal' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t('account.updatePaymentMethod')}</Button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="text-base font-semibold text-foreground mb-3">{t('account.included')}</h3>
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
              <p className="text-muted-foreground">{isCanceled || subscription.pastDue ? t('account.accessUntil') : subscription.autoRenew ? t('account.nextRenewal') : t('account.currentPeriodEnds')}</p>
              <p className="font-medium tabular-nums text-foreground">{nextBill}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('account.receiptEmail')}</p>
              <p className="font-medium text-foreground">{subscription.userEmail}</p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-2" data-tour="billing-actions">
          <Button onClick={() => setUpgradeOpen(true)} disabled={Boolean(busy)}>{t('account.upgradeChangePlan')}</Button>
          <Button variant="outline" onClick={() => setCycleOpen(true)} disabled={Boolean(busy) || isCanceled || subscription.planId === 'free'}>{t('account.changeBillingCycle')}</Button>
          {isCanceled ? (
            <Button variant="outline" onClick={() => void resumeSub()} disabled={Boolean(busy)}>
              {busy === 'resume' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t('account.keepMyPlan')}</Button>
          ) : (
            <Button variant="outline" onClick={() => setCancelOpen(true)} disabled={Boolean(busy) || subscription.planId === 'free'}>{t('account.cancelSubscription')}</Button>
          )}
        </div>
      </Card>

      <div data-tour="billing-invoices">
        <h3 className="mb-3 text-lg font-semibold tracking-tight text-foreground">{t('account.invoiceHistory')}</h3>
        <Card className="overflow-hidden rounded-3xl border-border/70">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">{t('account.invoice')}</th>
                  <th className="px-4 py-3 text-left font-medium">{t('account.date')}</th>
                  <th className="px-4 py-3 text-left font-medium">{t('account.amount')}</th>
                  <th className="px-4 py-3 text-left font-medium">{t('account.status')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('account.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {invoicesError && invoices.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState
                        compact
                        illustration="error"
                        title={t('account.couldntLoadInvoices')}
                        description={t('account.checkYourConnectionAndTryAgain')}
                        actionLabel={t('common.tryAgain')}
                        onAction={() => setReloadKey((k) => k + 1)}
                      />
                    </td>
                  </tr>
                ) : invoices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">{t('account.noInvoicesYetCompleteAPlan419')}</td>
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
                        <Badge
                          variant="outline"
                          className={cn('capitalize', inv.status === 'refunded' && 'border-amber-500/40 text-amber-700 dark:text-amber-400')}
                        >
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right space-x-1">
                        <Button variant="ghost" size="sm" className="gap-1" onClick={() => void openInvoice(inv)}>
                          <Eye className="h-4 w-4" />{t('account.view')}</Button>
                        <Button variant="ghost" size="sm" className="gap-1" asChild>
                          <a href={inv.downloadUrl || `/api/billing/invoices/${inv.id}/download`} target="_blank" rel="noreferrer">
                            <Download className="h-4 w-4" />{t('account.download')}</a>
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
            <h3 className="text-lg font-semibold text-foreground">{t('account.paymentMethod')}</h3>
            <p className="text-sm text-muted-foreground mt-1">{t('account.theCardUsedForYourSubscriptiona53')}</p>
          </div>
          {/* Stripe subscriptions: the card is changed in Stripe's billing portal.
              Other gateways take the card at each checkout. */}
          {subscription.provider === 'stripe' ? (
            <Button variant="outline" className="gap-2" onClick={() => void openPortal()} disabled={Boolean(busy)}>
              {busy === 'portal' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" aria-hidden />}{t('account.managePaymentMethod')}</Button>
          ) : null}
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
              <p className="text-xs text-muted-foreground">{t('account.expiresExpMonthExpYearValue', { exp_month: defaultPm.exp_month, exp_year: defaultPm.exp_year, value: defaultPm.is_default ? t('account.default') : '' })}</p>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">{t('account.noCardOnFileYourCard708')}</p>
        )}
      </Card>

      {/* Upgrade */}
      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('account.changePlan')}</DialogTitle>
            <DialogDescription>{t('account.pickAPlanAndBillingInterval08e')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('account.plan')}</Label>
              <select aria-label={t('account.plan')}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={pickPlan}
                onChange={(e) => setPickPlan(e.target.value)}
              >
                {plans.map((p) => {
                  const mode = modeOf(p)
                  return (
                    <option key={p.id} value={p.id} disabled={mode === 'free'}>
                      {mode === 'contact_sales'
                        ? t('account.nameContactSales', { name: p.name })
                        : mode === 'free'
                          ? t('account.nameFree', { name: p.name })
                          : t('account.nameAmountPriceMoAmount2Yearlypricef56', { name: p.name, amount: getCurrencySymbol(p.currency || currency), price: p.price, amount2: getCurrencySymbol(p.currency || currency), yearlyPrice: p.yearlyPrice })}
                    </option>
                  )
                })}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t('account.billingInterval')}</Label>
              <div className="flex gap-2">
                {(['month', 'year'] as const).map((iv) => (
                  <Button
                    key={iv}
                    type="button"
                    variant={pickInterval === iv ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPickInterval(iv)}
                  >
                    {iv === 'year' ? t('account.annualSave15') : t('account.monthly')}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpgradeOpen(false)}>{t('common.close')}</Button>
            {pickedMode === 'contact_sales' ? (
              <Button asChild>
                <a href={CONTACT_SALES_HREF}>{t('account.contactSales')}</a>
              </Button>
            ) : (
              <Button onClick={() => void runCheckout()} disabled={Boolean(busy) || pickedMode !== 'checkout'}>
                {busy === 'checkout' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t('account.payActivate')}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Billing cycle */}
      <Dialog open={cycleOpen} onOpenChange={setCycleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('account.billingCycle')}</DialogTitle>
            <DialogDescription>{t('account.switchBetweenMonthlyAndAnnualRenewal')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 py-2">
            <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => changeCycle('month')}>{t('account.monthly')}</Button>
            <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => changeCycle('year')}>{t('account.annual')}</Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCycleOpen(false)}>{t('common.close')}</Button>
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
            <DialogTitle>{t('account.invoice')}</DialogTitle>
            <DialogDescription>{t('account.summaryForYourRecords')}</DialogDescription>
          </DialogHeader>
          {invoiceDetail ? (
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">{t('account.amount2')}</span>{' '}
                <strong>
                  {getCurrencySymbol(invoiceDetail.currency || currency)}{invoiceDetail.amount.toFixed(2)} {invoiceDetail.currency}
                </strong>
              </p>
              <p>
                <span className="text-muted-foreground">{t('account.status2')}</span>{' '}
                <span className="capitalize">{invoiceDetail.status}</span>
              </p>
              {invoiceDetail.refundedAt ? (
                <p>
                  <span className="text-muted-foreground">{t('account.refundedOn')}</span> {formatDateTime(invoiceDetail.refundedAt)}
                </p>
              ) : null}
              <p>
                <span className="text-muted-foreground">{t('account.date2')}</span>{' '}
                {formatDateTime(invoiceDetail.createdAt)}
              </p>
              {invoiceDetail.description ? (
                <p>
                  <span className="text-muted-foreground">{t('account.description')}</span> {invoiceDetail.description}
                </p>
              ) : null}
              <Button className="mt-4 w-full gap-2" variant="outline" asChild>
                <a href={invoiceDetail.downloadUrl} target="_blank" rel="noreferrer">
                  <Download className="h-4 w-4" />{t('account.downloadReceipt')}</a>
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
            <AlertDialogTitle>{t('account.cancelSubscription2')}</AlertDialogTitle>
            <AlertDialogDescription>
              {subscription.provider === 'stripe'
                ? t('account.automaticRenewalStopsYouKeepAccesse03')
                : t('account.youKeepAccessUntilTheEnd566')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('account.keepPlan')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void cancelSub()
              }}
            >
              {busy === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t('account.confirmCancel')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function BillingPage() {
  const { t } = useT()
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready) {
      const billingTour: TourStep[] = [
        {
          target: '[data-tour="billing-header"]',
          title: t('account.billingCentralHub'),
          description: t('account.manageYourSubscriptionPaymentMethodAnd020'),
          position: 'bottom',
        },
        {
          target: '[data-tour="billing-actions"]',
          title: t('account.adjustSubscriptionHere'),
          description: t('account.startPlanUpgradesCycleSwitchesOrda9'),
          position: 'bottom',
        },
        {
          target: '[data-tour="billing-invoices"]',
          title: t('account.downloadReceiptsQuickly'),
          description: t('account.tipOpenViewForInvoiceDetailsae3'),
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

