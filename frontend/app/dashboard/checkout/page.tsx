'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ShieldCheck, ShoppingCart, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { csrfFetch } from '@/lib/csrf-fetch'
import { completeCheckout } from '@/lib/razorpay-checkout'
import { useToast } from '@/lib/toast-context'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'
import { formatCurrency } from '@/lib/i18n/format'
import { isValidPlanId, parseInterval, type PlanInterval } from '@/lib/billing-plan-mode'
import { BillingDetailsForm, type BillingProfileView } from '../billing/billing-details-form'

interface Quote {
  plan: { id: string; name: string; interval: PlanInterval | null; perks: string[] }
  currency: string
  list: number
  discount: number
  credit: number
  total: number
  tax: { kind: 'intra_state' | 'inter_state' | 'export' | 'none'; placeOfSupply: string | null; taxable: number; cgst: number; sgst: number; igst: number; rateBps: number }
  autoRenew: boolean
  coupon: { code: string; error: string | null; errorCode: string | null } | null
}

function CheckoutInner() {
  const { t, locale } = useT()
  const apiError = useApiError()
  const addToast = useToast()
  const router = useRouter()
  const sp = useSearchParams()
  const planId = sp.get('plan') || ''
  const [interval, setInterval] = useState<PlanInterval>(parseInterval(sp.get('interval')))
  const [currency, setCurrency] = useState<'INR' | 'USD' | null>(sp.get('currency') === 'USD' ? 'USD' : sp.get('currency') === 'INR' ? 'INR' : null)
  const [couponInput, setCouponInput] = useState(sp.get('coupon') || '')
  const [coupon, setCoupon] = useState(sp.get('coupon') || '')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [profile, setProfile] = useState<BillingProfileView | null>(null)
  const [showDetails, setShowDetails] = useState(false)

  const money = useCallback((minor: number, cur: string) => formatCurrency(locale, minor / 100, cur), [locale])

  const load = useCallback(async () => {
    if (!isValidPlanId(planId)) {
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      const res = await csrfFetch('/api/billing/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan_id: planId, interval, ...(currency ? { currency } : {}), ...(coupon ? { coupon_code: coupon } : {}) }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(apiError(j, t('account.checkoutQuoteFailed')))
      setQuote(j.quote)
      if (!currency && (j.quote?.currency === 'INR' || j.quote?.currency === 'USD')) setCurrency(j.quote.currency)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t('account.checkoutQuoteFailed'))
    } finally {
      setLoading(false)
    }
  }, [planId, interval, currency, coupon, apiError, t])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    fetch('/api/billing/profile', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.profile) setProfile(j.profile)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const pay = async () => {
    if (!quote) return
    setPaying(true)
    try {
      const res = await csrfFetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan_id: quote.plan.id, interval, currency: quote.currency, ...(quote.coupon && !quote.coupon.error ? { coupon_code: quote.coupon.code } : {}) }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(apiError(j, t('account.checkoutFailed')))
      const outcome = await completeCheckout(j, { description: quote.plan.name })
      if (outcome.status === 'paid') {
        addToast({ type: 'success', title: t('account.paymentConfirmed'), message: t('account.yourPlanIsUpdated') })
        router.push('/dashboard/billing')
      }
    } catch (e) {
      addToast({ type: 'error', title: t('account.checkout'), message: e instanceof Error ? e.message : t('account.checkoutFailed') })
    } finally {
      setPaying(false)
    }
  }

  const taxRows = useMemo(() => {
    if (!quote) return []
    const tx = quote.tax
    const pct = (bps: number) => `${bps / 100}%`
    if (tx.kind === 'intra_state') return [[t('account.checkoutCgst', { rate: pct(tx.rateBps / 2) }), tx.cgst], [t('account.checkoutSgst', { rate: pct(tx.rateBps / 2) }), tx.sgst]] as const
    if (tx.kind === 'inter_state') return [[t('account.checkoutIgst', { rate: pct(tx.rateBps) }), tx.igst]] as const
    return []
  }, [quote, t])

  if (!isValidPlanId(planId)) {
    return (
      <EmptyState
        title={t('account.checkoutNoPlan')}
        description={t('account.checkoutNoPlanBody')}
        actionLabel={t('account.checkoutSeePlans')}
        actionHref="/dashboard/pricing"
      />
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <PageHeader title={t('account.checkoutTitle')} description={t('account.checkoutDescription')} icon={<ShoppingCart aria-hidden />} />

      {loading && !quote ? (
        <SkeletonCard />
      ) : loadError && !quote ? (
        <Panel className="p-6 text-center">
          <p role="alert" className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" className="mt-4 gap-2" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            {t('common.tryAgain')}
          </Button>
        </Panel>
      ) : quote ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <Panel className="space-y-5 p-6">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{quote.plan.name}</h2>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {quote.plan.perks.slice(0, 6).map((p) => <li key={p}>{p}</li>)}
                </ul>
              </div>

              <fieldset>
                <legend className="mb-2 text-sm font-medium text-foreground">{t('account.checkoutBillingCycle')}</legend>
                <div className="flex flex-wrap gap-2">
                  {(['month', 'year'] as const).map((iv) => (
                    <Button key={iv} type="button" size="sm" variant={interval === iv ? 'default' : 'outline'} aria-pressed={interval === iv} onClick={() => setInterval(iv)}>
                      {iv === 'year' ? t('account.annual') : t('account.monthly')}
                    </Button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-sm font-medium text-foreground">{t('account.checkoutCurrency')}</legend>
                <div className="flex flex-wrap gap-2">
                  {(['INR', 'USD'] as const).map((c) => (
                    <Button key={c} type="button" size="sm" variant={quote.currency === c ? 'default' : 'outline'} aria-pressed={quote.currency === c} onClick={() => setCurrency(c)}>
                      {c === 'INR' ? t('account.checkoutInr') : t('account.checkoutUsd')}
                    </Button>
                  ))}
                </div>
              </fieldset>

              <form
                className="space-y-1.5"
                onSubmit={(e) => {
                  e.preventDefault()
                  setCoupon(couponInput.trim().toUpperCase())
                }}
              >
                <Label htmlFor="co-coupon">{t('account.checkoutCoupon')}</Label>
                <div className="flex gap-2">
                  <Input id="co-coupon" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} maxLength={64} className="uppercase" autoComplete="off" />
                  <Button type="submit" variant="outline">{t('account.checkoutApply')}</Button>
                </div>
                {quote.coupon?.error ? (
                  <p role="alert" className="text-sm text-destructive">{apiError({ error: quote.coupon.error, code: quote.coupon.errorCode }, quote.coupon.error)}</p>
                ) : quote.coupon ? (
                  <p role="status" className="text-sm text-green-700 dark:text-green-400">{t('account.checkoutCouponApplied', { code: quote.coupon.code })}</p>
                ) : null}
              </form>
            </Panel>

            <Panel className="space-y-4 p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{t('account.billingDetailsTitle')}</h2>
                  <p className="text-sm text-muted-foreground">
                    {profile?.gstin ? t('account.billingDetailsGstinOnFile', { gstin: profile.gstin }) : t('account.billingDetailsOptional')}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" aria-expanded={showDetails} aria-controls="co-details" onClick={() => setShowDetails((v) => !v)}>
                  {showDetails ? t('account.billingDetailsHide') : t('account.billingDetailsEdit')}
                </Button>
              </div>
              {showDetails ? (
                <div id="co-details">
                  <BillingDetailsForm
                    initial={profile}
                    onSaved={(p) => {
                      setProfile(p)
                      void load()
                    }}
                  />
                </div>
              ) : null}
            </Panel>
          </div>

          <Panel className="h-fit space-y-4 p-6 lg:sticky lg:top-6" aria-live="polite">
            <h2 className="text-lg font-semibold text-foreground">{t('account.checkoutSummary')}</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{interval === 'year' ? t('account.checkoutPriceYear') : t('account.checkoutPriceMonth')}</dt>
                <dd className="tabular-nums text-foreground">{money(quote.list, quote.currency)}</dd>
              </div>
              {quote.discount > 0 ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t('account.checkoutDiscount')}</dt>
                  <dd className="tabular-nums text-foreground">−{money(quote.discount, quote.currency)}</dd>
                </div>
              ) : null}
              {quote.credit > 0 ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t('account.checkoutCredit')}</dt>
                  <dd className="tabular-nums text-foreground">−{money(quote.credit, quote.currency)}</dd>
                </div>
              ) : null}
              {quote.tax.kind === 'intra_state' || quote.tax.kind === 'inter_state' ? (
                <>
                  <div className="flex justify-between gap-4 border-t border-border pt-2">
                    <dt className="text-muted-foreground">{t('account.checkoutTaxable')}</dt>
                    <dd className="tabular-nums text-foreground">{money(quote.tax.taxable, quote.currency)}</dd>
                  </div>
                  {taxRows.map(([label, v]) => (
                    <div key={label} className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="tabular-nums text-foreground">{money(v, quote.currency)}</dd>
                    </div>
                  ))}
                </>
              ) : null}
              <div className="flex justify-between gap-4 border-t border-border pt-2 text-base font-semibold">
                <dt className="text-foreground">{t('account.checkoutTotal')}</dt>
                <dd className="tabular-nums text-foreground">{money(quote.total, quote.currency)}</dd>
              </div>
            </dl>
            {quote.tax.kind === 'export' ? <p className="text-xs text-muted-foreground">{t('account.checkoutNoGst')}</p> : null}
            {quote.tax.kind === 'intra_state' || quote.tax.kind === 'inter_state' ? <p className="text-xs text-muted-foreground">{t('account.checkoutGstIncluded')}</p> : null}
            <p className="text-xs text-muted-foreground">{quote.autoRenew ? t('account.checkoutAutoRenew') : t('account.checkoutPrepaid')}</p>
            <Button className="w-full gap-2" size="lg" onClick={() => void pay()} disabled={paying || loading}>
              {paying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
              {quote.total > 0 ? t('account.checkoutPay', { amount: money(quote.total, quote.currency) }) : t('account.checkoutActivate')}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              <Link href="/dashboard/pricing" className="underline underline-offset-4">{t('account.checkoutChangePlan')}</Link>
            </p>
          </Panel>
        </div>
      ) : null}
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-5xl px-4 py-6"><SkeletonCard /></div>}>
      <CheckoutInner />
    </Suspense>
  )
}
