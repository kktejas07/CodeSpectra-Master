'use client'

/**
 * /dashboard/billing additions: invoice details (GSTIN), account credit from
 * referrals, and upgrading the live plan with proration (POST /api/billing/change-plan).
 */
import { useCallback, useEffect, useState } from 'react'
import { ArrowUpRight, Gift, Loader2, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/app/page-kit'
import { csrfFetch } from '@/lib/csrf-fetch'
import { completeCheckout } from '@/lib/razorpay-checkout'
import { useToast } from '@/lib/toast-context'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'
import { formatCurrency, formatDate } from '@/lib/i18n/format'
import { BillingDetailsForm, type BillingProfileView } from './billing-details-form'
import { NativePurchaseGate } from '@/components/native/native-purchase-gate'

interface PlanRow { id: string; name: string; checkout_mode?: string }
interface Preview { kind: string; charge_now: number; credit: number; currency: string; period_end: string; plan: { id: string; name: string; interval: 'month' | 'year' } }

export function BillingExtras({ hasPlan, onChanged }: { hasPlan: boolean; onChanged: () => void }) {
  const { t, locale } = useT()
  const apiError = useApiError()
  const addToast = useToast()
  const [profile, setProfile] = useState<BillingProfileView | null>(null)
  const [credit, setCredit] = useState<{ INR: number; USD: number }>({ INR: 0, USD: 0 })
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [target, setTarget] = useState('')
  const [interval, setInterval] = useState<'month' | 'year'>('month')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'preview' | 'confirm' | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/billing/profile', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/billing/plans', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([p, pl]) => {
        if (cancelled) return
        if (p?.profile) setProfile(p.profile)
        if (p?.credit) setCredit(p.credit)
        if (Array.isArray(pl)) setPlans(pl.filter((x: PlanRow) => x.checkout_mode === 'checkout'))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const money = useCallback((minor: number, cur: string) => formatCurrency(locale, minor / 100, cur), [locale])

  const call = async (confirm: boolean) => {
    if (!target) return
    setBusy(confirm ? 'confirm' : 'preview')
    setPreviewError(null)
    try {
      const res = await csrfFetch('/api/billing/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan_id: target, interval, confirm }),
      })
      const j = await res.json().catch(() => ({}))
      if (j.preview) setPreview(j.preview)
      if (!res.ok) throw new Error(apiError(j, t('account.changePlanFailed')))
      if (!confirm) return
      if (j.provider === 'stripe' && j.pending) {
        addToast({ type: 'success', title: t('account.changePlanStarted'), message: t('account.changePlanStripeNote') })
        onChanged()
        return
      }
      const outcome = await completeCheckout(j, { description: j.preview?.plan?.name })
      if (outcome.status === 'paid') {
        addToast({ type: 'success', title: t('account.paymentConfirmed'), message: t('account.yourPlanIsUpdated') })
        setPreview(null)
        onChanged()
      }
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : t('account.changePlanFailed'))
    } finally {
      setBusy(null)
    }
  }

  const hasCredit = credit.INR > 0 || credit.USD > 0

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {hasPlan && plans.length ? (
        // CORE-038: no plan upgrade inside the phone apps (store rules).
        <NativePurchaseGate fallback={null}>
        <Panel className="space-y-4 p-6">
          <div className="flex items-start gap-3">
            <ArrowUpRight className="mt-1 h-5 w-5 text-primary" aria-hidden />
            <div>
              <h3 className="text-lg font-semibold text-foreground">{t('account.changePlanTitle')}</h3>
              <p className="text-sm text-muted-foreground">{t('account.changePlanBody')}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="cp-plan" className="text-sm font-medium text-foreground">{t('account.changePlanPick')}</label>
              <select
                id="cp-plan"
                value={target}
                onChange={(e) => { setTarget(e.target.value); setPreview(null) }}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">{t('account.changePlanChoose')}</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="cp-interval" className="text-sm font-medium text-foreground">{t('account.checkoutBillingCycle')}</label>
              <select
                id="cp-interval"
                value={interval}
                onChange={(e) => { setInterval(e.target.value === 'year' ? 'year' : 'month'); setPreview(null) }}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="month">{t('account.monthly')}</option>
                <option value="year">{t('account.annual')}</option>
              </select>
            </div>
          </div>
          {preview ? (
            <div className="rounded-2xl border border-border bg-muted/20 p-4 text-sm" aria-live="polite">
              {preview.kind === 'downgrade_at_renewal' || preview.kind === 'no_change' ? (
                <p className="text-muted-foreground">{t('account.changePlanAtRenewal')}</p>
              ) : (
                <>
                  <p className="font-medium text-foreground">{t('account.changePlanChargeNow', { amount: money(preview.charge_now, preview.currency) })}</p>
                  {preview.credit > 0 ? <p className="text-muted-foreground">{t('account.changePlanCredit', { amount: money(preview.credit, preview.currency) })}</p> : null}
                  <p className="text-muted-foreground">{t('account.changePlanUntil', { date: formatDate(locale, preview.period_end) })}</p>
                </>
              )}
            </div>
          ) : null}
          {previewError ? <p role="alert" className="text-sm text-destructive">{previewError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!target || !!busy} onClick={() => void call(false)} className="gap-2">
              {busy === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {t('account.changePlanPreview')}
            </Button>
            <Button disabled={!preview || preview.kind === 'downgrade_at_renewal' || preview.kind === 'no_change' || !!busy} onClick={() => void call(true)} className="gap-2">
              {busy === 'confirm' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {t('account.changePlanConfirm')}
            </Button>
          </div>
        </Panel>
        </NativePurchaseGate>
      ) : null}

      <Panel className="space-y-4 p-6">
        <div className="flex items-start gap-3">
          <Receipt className="mt-1 h-5 w-5 text-primary" aria-hidden />
          <div>
            <h3 className="text-lg font-semibold text-foreground">{t('account.billingDetailsTitle')}</h3>
            <p className="text-sm text-muted-foreground">{t('account.billingDetailsBody')}</p>
          </div>
        </div>
        <BillingDetailsForm initial={profile} onSaved={setProfile} />
      </Panel>

      {hasCredit ? (
        <Panel className="flex items-start gap-3 p-6">
          <Gift className="mt-1 h-5 w-5 text-primary" aria-hidden />
          <div>
            <h3 className="text-lg font-semibold text-foreground">{t('account.creditTitle')}</h3>
            <p className="text-sm text-muted-foreground">
              {[credit.INR > 0 ? money(credit.INR, 'INR') : null, credit.USD > 0 ? money(credit.USD, 'USD') : null].filter(Boolean).join(' · ')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t('account.creditBody')}</p>
          </div>
        </Panel>
      ) : null}
    </div>
  )
}
