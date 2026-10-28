'use client'

import { NativePurchaseGate } from '@/components/native/native-purchase-gate'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, CheckCircle2, Crown, Zap, ArrowRight, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { completeCheckout } from '@/lib/razorpay-checkout'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { useCurrency } from '@/lib/use-currency'
import { getCurrencySymbol } from '@/lib/currency'
import {
  CONTACT_SALES_HREF,
  isValidPlanId,
  parseInterval,
  planCheckoutMode,
  type PlanCheckoutMode,
  type PlanInterval,
} from '@/lib/billing-plan-mode'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n/client'

interface PlanRow {
  id: string
  name: string
  description: string
  price: number
  yearlyPrice: number
  features: string[]
  popular?: boolean
  mode: PlanCheckoutMode
  /** Currency the plan is charged in (from the checkout resolver). */
  currency: string | null
}

function PricingContent() {
  const { t } = useT()
  const router = useRouter()
  const searchParams = useSearchParams()
  const addToast = useToast()
  const { symbol } = useCurrency()

  const [plans, setPlans] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [currentPlanId, setCurrentPlanId] = useState<string>('free')

  // ?plan=…&interval=year — carried from the public pricing page through signup.
  const requestedPlan = searchParams.get('plan')
  const [interval, setBillingInterval] = useState<PlanInterval>(parseInterval(searchParams.get('interval')))

  const [checkoutPlan, setCheckoutPlan] = useState<PlanRow | null>(null)
  const [couponCode, setCouponCode] = useState('')
  const [discountInfo, setDiscountInfo] = useState<{ valid: boolean; type: string; value: number; error?: string } | null>(null)
  const [checkingCoupon, setCheckingCoupon] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [freeOpen, setFreeOpen] = useState(false)
  const [switchingFree, setSwitchingFree] = useState(false)

  const loadCurrent = useCallback(async () => {
    const r = await fetch('/api/billing/subscription', { credentials: 'include' })
    if (!r.ok) return
    const d = await r.json().catch(() => null)
    setCurrentPlanId(d?.subscription?.plan_id || 'free')
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    ;(async () => {
      try {
        const r = await fetch('/api/billing/plans', { credentials: 'include' })
        if (!r.ok) throw new Error('plans')
        const data = await r.json()
        if (cancelled) return
        const rows: PlanRow[] = (Array.isArray(data) ? data : []).map((p: Record<string, unknown>) => {
          const id = String(p.id)
          const price = Number(p.price) || 0
          const yearlyPrice = Number(p.yearlyPrice) || 0
          const mode = (['free', 'contact_sales', 'checkout'] as const).includes(p.checkout_mode as PlanCheckoutMode)
            ? (p.checkout_mode as PlanCheckoutMode)
            : planCheckoutMode({ id, price, yearlyPrice })
          return {
            id,
            name: String(p.name || id),
            description: String(p.description || ''),
            price,
            yearlyPrice,
            features: Array.isArray(p.features) ? (p.features as unknown[]).map(String) : [],
            popular: Boolean(p.popular),
            mode,
            currency: typeof p.currency === 'string' && /^[A-Z]{3}$/.test(p.currency) ? p.currency : null,
          }
        })
        setPlans(rows)
        await loadCurrent()
      } catch {
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadCurrent, reloadKey])

  // 100%-off coupon checkouts redirect back here.
  useEffect(() => {
    if (searchParams.get('payment') === 'free' && searchParams.get('status') === 'success') {
      addToast({ type: 'success', title: t('account.planActivated'), message: t('account.yourCouponCoveredTheFullPrice') })
    }
  }, [searchParams, addToast])

  const preselected = useMemo(
    () => (isValidPlanId(requestedPlan) ? plans.find((p) => p.id === requestedPlan) ?? null : null),
    [plans, requestedPlan],
  )

  const priceFor = (p: PlanRow) => (interval === 'year' ? p.yearlyPrice : p.price)
  // Charged currency wins over the platform display currency (D12).
  const planCurrency = plans.find((p) => p.mode === 'checkout' && p.currency)?.currency ?? null
  const sym = planCurrency ? getCurrencySymbol(planCurrency) : symbol
  const money = (n: number) => `${sym}${Number.isInteger(n) ? n : n.toFixed(2)}`

  const openCheckout = (p: PlanRow) => {
    if (p.mode === 'contact_sales') {
      router.push(CONTACT_SALES_HREF)
      return
    }
    if (p.mode === 'free') {
      if (currentPlanId !== 'free') setFreeOpen(true)
      return
    }
    setCheckoutPlan(p)
  }

  const closeCheckout = () => {
    setCheckoutPlan(null)
    setCouponCode('')
    setDiscountInfo(null)
  }

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return
    try {
      setCheckingCoupon(true)
      const res = await csrfFetch('/api/billing/coupons/validate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode, target: 'plans', currency: checkoutPlan?.currency ?? planCurrency ?? undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setDiscountInfo({ valid: false, type: '', value: 0, error: data.error || 'Invalid coupon' })
        return
      }
      setDiscountInfo({ valid: true, type: data.coupon.discount_type, value: data.coupon.discount_value })
    } catch {
      setDiscountInfo({ valid: false, type: '', value: 0, error: 'Could not check the coupon. Try again.' })
    } finally {
      setCheckingCoupon(false)
    }
  }

  const handleCheckout = async () => {
    if (!checkoutPlan) return
    try {
      setCheckoutLoading(true)
      const res = await csrfFetch('/api/billing/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: checkoutPlan.id,
          interval,
          coupon_code: discountInfo?.valid ? couponCode : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409 && data.code === 'contact_sales') {
        router.push(CONTACT_SALES_HREF)
        return
      }
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : t('account.checkoutFailed'))
      // Opens Razorpay (or redirects) and only reports success after server verification.
      const outcome = await completeCheckout(data, { description: checkoutPlan.name })
      if (outcome.status === 'paid') {
        addToast({ type: 'success', title: t('account.paymentConfirmed'), message: t('account.youAreNowOnTheNamefac', { name: checkoutPlan.name }) })
        closeCheckout()
        await loadCurrent()
      }
    } catch (e) {
      addToast({ type: 'error', title: t('account.checkout'), message: e instanceof Error ? e.message : t('account.checkoutFailed') })
    } finally {
      setCheckoutLoading(false)
    }
  }

  const switchToFree = async () => {
    setSwitchingFree(true)
    try {
      const res = await csrfFetch('/api/billing/subscription', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: 'free' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : t('account.couldNotSwitchPlans'))
      setFreeOpen(false)
      addToast({ type: 'success', title: t('account.planCancelled'), message: t('account.youKeepPaidFeaturesUntilThe678') })
      await loadCurrent()
    } catch (e) {
      addToast({ type: 'error', title: t('account.planChange'), message: e instanceof Error ? e.message : t('account.couldNotSwitchPlans') })
    } finally {
      setSwitchingFree(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="h-10 w-64 animate-pulse rounded bg-muted/60" />
          <div className="h-5 w-80 max-w-full animate-pulse rounded bg-muted/40" />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  if (loadError || plans.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader illustration="billing" icon={<Crown aria-hidden />} title={t('account.chooseYourPlan')} />
        <EmptyState
          illustration="error"
          title={loadError ? t('account.weCouldntLoadThePlans') : t('account.noPlansAreAvailableYet')}
          description={loadError ? t('account.checkYourConnectionAndTryAgainf3d') : t('account.checkBackSoonOrContactUscfe')}
          actionLabel={loadError ? t('common.tryAgain') : t('account.contactSales')}
          onAction={loadError ? () => setReloadKey((k) => k + 1) : undefined}
          actionHref={loadError ? undefined : CONTACT_SALES_HREF}
        />
      </div>
    )
  }

  const hasYearly = plans.some((p) => p.mode === 'checkout' && p.yearlyPrice > 0)

  return (
    <div className="space-y-6">
      <div data-tour="pricing-header">
        <PageHeader
          illustration="billing"
          className="mb-0"
          icon={<Crown aria-hidden />}
          title={t('account.chooseYourPlan')}
          description={t('account.startFreeAndUpgradeWhenYou76f')}
          actions={
            hasYearly ? (
              <div className="inline-flex rounded-full border border-border bg-card p-1" role="group" aria-label={t('account.billingInterval')}>
                {(['month', 'year'] as const).map((iv) => (
                  <button
                    key={iv}
                    type="button"
                    aria-pressed={interval === iv}
                    onClick={() => setBillingInterval(iv)}
                    className={cn(
                      'min-h-9 rounded-full px-4 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-primary',
                      interval === iv ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {iv === 'year' ? t('account.annual') : t('account.monthly')}
                  </button>
                ))}
              </div>
            ) : null
          }
        />
      </div>

      {requestedPlan ? (
        preselected ? (
          <Panel className="flex flex-wrap items-center justify-between gap-4 border-primary/30" aria-live="polite">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{t('account.youPicked')}</p>
              <p className="text-lg font-semibold text-foreground">
                {preselected.name}
                {preselected.mode === 'checkout' ? (
                  <span className="ml-2 text-base font-normal tabular-nums text-muted-foreground">
                    {money(priceFor(preselected))}/{interval === 'year' ? t('account.year') : t('account.month')}
                  </span>
                ) : null}
              </p>
              {preselected.id === currentPlanId ? (
                <p className="mt-1 text-sm text-muted-foreground">{t('account.thisIsAlreadyYourCurrentPlan')}</p>
              ) : preselected.mode === 'free' ? (
                <p className="mt-1 text-sm text-muted-foreground">{t('account.theFreePlanDoesntNeedCheckout')}</p>
              ) : preselected.mode === 'contact_sales' ? (
                <p className="mt-1 text-sm text-muted-foreground">{t('account.thisPlanIsSetUpWithec7')}</p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">{t('account.yourPlanChangesOnceThePaymentb9a')}</p>
              )}
            </div>
            {preselected.id === currentPlanId ? null : preselected.mode === 'checkout' ? (
              <Button size="lg" className="gap-2" onClick={() => openCheckout(preselected)}>{t('account.continueToCheckout')}{' '}<ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            ) : preselected.mode === 'contact_sales' ? (
              <Button size="lg" className="gap-2" asChild>
                <Link href={CONTACT_SALES_HREF}>
                  <MessageSquare className="h-4 w-4" aria-hidden />{' '}{t('account.contactSales')}</Link>
              </Button>
            ) : null}
          </Panel>
        ) : (
          <Panel role="status" className="text-sm text-muted-foreground">{t('account.thePlanYouPickedIsntAvailablea22')}</Panel>
        )
      ) : null}

      <div className="grid gap-5 pt-3 md:grid-cols-3" data-tour="pricing-plans">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId
          const isPicked = preselected?.id === plan.id
          const highlight = isPicked || (!preselected && plan.popular)
          const amount = priceFor(plan)
          return (
            <Card
              key={plan.id}
              className={cn(
                'relative rounded-3xl border-border/70 p-6',
                highlight && 'ring-2 ring-primary',
              )}
            >
              {isCurrent ? (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2" variant="secondary">{t('account.currentPlan')}</Badge>
              ) : isPicked ? (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">{t('account.yourPick')}</Badge>
              ) : plan.popular ? (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">{t('account.recommended')}</Badge>
              ) : null}
              <div className="mb-6 text-center">
                <h2 className="text-xl font-bold text-foreground">{plan.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                <div className="mt-4">
                  {plan.mode === 'contact_sales' ? (
                    <span className="text-3xl font-bold text-foreground">{t('account.custom')}</span>
                  ) : plan.mode === 'free' ? (
                    <span className="text-4xl font-bold text-foreground">Free</span>
                  ) : (
                    <>
                      <span className="text-4xl font-bold tabular-nums text-foreground">{money(amount)}</span>
                      <span className="text-sm text-muted-foreground">/{interval === 'year' ? t('account.yr') : t('account.mo')}</span>
                    </>
                  )}
                </div>
              </div>

              <ul className="mb-6 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span className="text-foreground">{f}</span>
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <Button className="w-full" variant="outline" disabled>{t('account.currentPlan')}</Button>
              ) : plan.mode === 'contact_sales' ? (
                <Button className="w-full gap-2" variant="outline" asChild data-tour="pricing-cta">
                  <Link href={CONTACT_SALES_HREF}><MessageSquare className="h-4 w-4" aria-hidden />{' '}{t('account.contactSales')}</Link>
                </Button>
              ) : plan.mode === 'free' ? (
                <Button className="w-full" variant="outline" onClick={() => setFreeOpen(true)}>{t('account.switchToFree')}</Button>
              ) : (
                <Button className="w-full gap-2" data-tour="pricing-cta" onClick={() => openCheckout(plan)}>
                  <Crown className="h-4 w-4" aria-hidden />{' '}{t('account.upgradeToName', { name: plan.name })}</Button>
              )}
            </Card>
          )
        })}
      </div>

      <Dialog open={!!checkoutPlan} onOpenChange={(v) => { if (!v) closeCheckout() }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t('account.completeYourUpgrade')}</DialogTitle>
            <DialogDescription>{t('account.youAreUpgradingToNameBilled682', { name: checkoutPlan?.name, value: interval === 'year' ? t('account.yearly') : t('account.monthly2') })}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-muted/20 p-4">
              <span className="font-medium text-foreground">{t('account.price')}</span>
              <span className="font-bold tabular-nums">
                {checkoutPlan ? `${money(priceFor(checkoutPlan))}/${interval === 'year' ? 'year' : 'month'}` : ''}
              </span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="coupon">{t('account.haveACouponCode')}</Label>
              <div className="flex gap-2">
                <Input
                  id="coupon"
                  placeholder={t('account.enterCode')}
                  value={couponCode}
                  onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setDiscountInfo(null) }}
                  className="uppercase"
                  maxLength={64}
                />
                <Button variant="secondary" onClick={handleApplyCoupon} disabled={checkingCoupon || !couponCode}>
                  {checkingCoupon ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : t('account.apply')}
                </Button>
              </div>
              {discountInfo && (
                <p className={cn('text-sm', discountInfo.valid ? 'text-green-600 dark:text-green-400' : 'text-destructive')}>
                  {discountInfo.valid
                    ? t('account.couponAppliedValue', { value: discountInfo.type === 'flat' ? `${sym}${discountInfo.value} off` : `${discountInfo.value}% off` })
                    : discountInfo.error}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeCheckout}>{t('common.cancel')}</Button>
            <Button onClick={handleCheckout} disabled={checkoutLoading}>
              {checkoutLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Zap className="mr-2 h-4 w-4" aria-hidden />}{t('account.proceedToPayment')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={freeOpen} onOpenChange={setFreeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('account.switchToTheFreePlan')}</AlertDialogTitle>
            <AlertDialogDescription>{t('account.yourPaidPlanIsCancelledAt871')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('account.keepMyPlan')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); void switchToFree() }}
              disabled={switchingFree}
            >
              {switchingFree ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}{t('account.switchToFree')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function PricingPage() {
  const { t } = useT()
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready) {
      const pricingTour: TourStep[] = [
        {
          target: '[data-tour="pricing-header"]',
          title: t('account.plansThatScale'),
          description: t('account.startFreeAndUpgradeOnlyWhencd7'),
          position: 'bottom',
        },
        {
          target: '[data-tour="pricing-plans"]',
          title: t('account.comparePlans'),
          description: t('account.eachTierListsItsLimitsAnd6b6'),
          position: 'bottom',
        },
        {
          target: '[data-tour="pricing-cta"]',
          title: t('account.upgradeInOneClick'),
          description: t('account.chooseAPlanToOpenCheckoutdcd'),
          position: 'top',
        },
      ]
      autoPlayPageTour('pricing', pricingTour)
    }
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready) return null

  return (
    <Suspense
      fallback={
        <div className="grid gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      }
    >
      <NativePurchaseGate><PricingContent /></NativePurchaseGate>
    </Suspense>
  )
}
