'use client'

/**
 * Admin home bento: users, MRR, tests today, integrity flags, AI usage.
 * Reuses /api/admin/metrics (users) and /api/admin/billing/metrics (MRR per
 * currency, never summed across currencies); /api/admin/overview adds the
 * day series. Each card loads, fails and empties on its own.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Bot, Coins, ShieldAlert, Users } from 'lucide-react'
import { AnimatedIcon } from '@/components/icons/AnimatedIcon'
import { BentoEmpty, BentoGrid, BentoStat, MiniBars } from '@/components/bento'
import { useAdminT } from '@/lib/i18n/admin'
import type { AdminOverview } from '@/lib/admin/overview'
import { microsIn, moneyDigits } from '@/lib/ai/spend'

type Load<T> = { data: T | null; error: boolean }

function useAdminJson<T>(url: string): Load<T> & { loading: boolean } {
  const [s, setS] = useState<Load<T> & { loading: boolean }>({ data: null, error: false, loading: true })
  useEffect(() => {
    let live = true
    fetch(url, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (live) setS({ data: d as T, error: false, loading: false }) })
      .catch(() => { if (live) setS({ data: null, error: true, loading: false }) })
    return () => { live = false }
  }, [url])
  return s
}

interface CurrencyMetrics { currency: string; mrr: number; activeSubscriptions: number }

export function AdminOverviewBento({ totalUsers, usersLoaded, proctorHref }: { totalUsers: number; usersLoaded: boolean; proctorHref: string }) {
  const { t, fmt } = useAdminT()
  const number = fmt.number
  const ov = useAdminJson<AdminOverview>('/api/admin/overview')
  const billing = useAdminJson<{ metrics: CurrencyMetrics[] }>('/api/admin/billing/metrics?days=30')
  const loading = t('overview.loading')
  const failed = <BentoEmpty tone="error" title={t('overview.failed')} />

  const signups = ov.data?.signups.by_day ?? []
  const mrr = (billing.data?.metrics ?? []).filter((m) => m.mrr > 0)
  const subs = mrr.reduce((a, m) => a + m.activeSubscriptions, 0)
  const money = (minor: number, currency: string) => {
    try {
      return number(minor / 100, { style: 'currency', currency, maximumFractionDigits: 0 })
    } catch {
      return `${currency} ${Math.round(minor / 100)}`
    }
  }

  return (
    <section aria-label={t('overview.label')}>
      <BentoGrid cols={6}>
        <BentoStat
          span={2}
          smSpan={2}
          tone="brand"
          icon={<Users />}
          title={t('overview.users')}
          loading={!usersLoaded}
          loadingLabel={loading}
          value={number(totalUsers)}
          hint={ov.data ? t('overview.signupsHint', { n: number(signups.reduce((a, b) => a + b, 0)) }) : undefined}
          series={signups}
          seriesLabel={t('overview.signupsTrend')}
        />
        <BentoStat
          span={2}
          icon={<Coins />}
          title={t('overview.mrr')}
          loading={billing.loading}
          loadingLabel={loading}
          value={mrr.length ? (
            <span className="flex flex-col gap-1">
              {mrr.map((m) => <span key={m.currency} className={mrr.length > 1 ? 'text-4xl' : undefined}>{money(m.mrr, m.currency)}</span>)}
            </span>
          ) : undefined}
          hint={mrr.length ? t('overview.mrrHint', { count: subs }) : undefined}
          empty={billing.error ? failed : <BentoEmpty title={t('overview.mrrNone')} />}
          href="/dashboard/admin/billing"
        />
        <BentoStat
          span={2}
          icon={<AnimatedIcon name="check-circle" size={18} />}
          title={t('overview.testsToday')}
          loading={ov.loading}
          loadingLabel={loading}
          value={ov.data ? number(ov.data.tests.today) : undefined}
          hint={ov.data ? t('overview.testsHint', { n: number(ov.data.tests.by_day.reduce((a, b) => a + b, 0)) }) : undefined}
          empty={ov.error ? failed : undefined}
          visual={ov.data && ov.data.tests.by_day.some((n) => n > 0) ? <MiniBars data={ov.data.tests.by_day} label={t('overview.testsTrend')} /> : undefined}
        />
        <BentoStat
          span={3}
          smSpan={1}
          icon={<ShieldAlert />}
          title={t('overview.flags')}
          loading={ov.loading}
          loadingLabel={loading}
          value={ov.data && ov.data.flags.open > 0 ? number(ov.data.flags.open) : undefined}
          hint={t('overview.flagsHint')}
          empty={ov.error ? failed : <BentoEmpty title={t('overview.flagsNone')} />}
          action={t('overview.flagsAction')}
          href={proctorHref}
        />
        <AiSpendCard ov={ov} failed={failed} />
      </BentoGrid>
    </section>
  )
}

/** AI spend this month in USD and INR, trend vs last month, top 3 features by cost. */
function AiSpendCard({ ov, failed }: { ov: Load<AdminOverview> & { loading: boolean }; failed: ReactNode }) {
  const { t, fmt } = useAdminT()
  const sp = ov.data?.ai.spend ?? null
  const money = (micros: number, currency: 'USD' | 'INR') => {
    const amount = microsIn(micros, currency, sp?.usd_inr_rate ?? 0)
    const digits = moneyDigits(amount)
    return fmt.number(amount, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits })
  }
  const trend = sp?.trend_pct
  return (
    <BentoStat
      span={3}
      smSpan={1}
      icon={<Bot />}
      title={t('overview.aiSpend')}
      loading={ov.loading}
      loadingLabel={t('overview.loading')}
      value={sp ? money(sp.micros, 'USD') : undefined}
      unit={sp ? money(sp.micros, 'INR') : undefined}
      delta={sp && trend !== null && trend !== undefined
        ? { text: t('overview.aiSpendTrend', { pct: `${trend > 0 ? '+' : ''}${fmt.number(trend, { maximumFractionDigits: 1 })}` }), tone: trend > 0 ? 'down' : trend < 0 ? 'up' : 'flat' }
        : undefined}
      hint={ov.data ? (
        <>
          {sp && sp.top.length > 0 ? (
            <span className="block">
              {t('overview.aiSpendTop')}{' '}
              {sp.top.map((f, i) => (
                <span key={f.feature}>{i > 0 ? ', ' : ''}<span className="font-medium text-foreground">{f.feature}</span> {money(f.micros, 'USD')}</span>
              ))}
            </span>
          ) : <span className="block">{t('overview.aiSpendNone')}</span>}
          {sp && (
            <span className="mt-1 block text-xs">
              {sp.usd_inr_rate_updated_at
                ? t('overview.aiSpendRate', { rate: fmt.number(sp.usd_inr_rate), date: fmt.date(sp.usd_inr_rate_updated_at) })
                : t('overview.aiSpendRateDefault', { rate: fmt.number(sp.usd_inr_rate) })}
            </span>
          )}
          <span className="mt-1 block text-xs">{t('overview.aiHint', { tokens: fmt.number(ov.data.ai.tokens), failed: fmt.number(ov.data.ai.failed) })}</span>
          {sp && (sp.estimated_micros > 0 || sp.unpriced_calls > 0) && (
            <span className="mt-1 inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              {sp.unpriced_calls > 0 ? t('overview.aiSpendUnpriced', { n: fmt.number(sp.unpriced_calls) }) : t('overview.aiSpendEstimated')}
            </span>
          )}
          {sp && sp.budget.level > 0 && (
            <span className="ml-1 mt-1 inline-flex rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
              {t('overview.aiSpendBudget', { pct: sp.budget.level })}
            </span>
          )}
        </>
      ) : undefined}
      empty={ov.error ? failed : undefined}
      series={ov.data?.ai.by_day}
      seriesLabel={t('overview.aiTrend')}
      action={t('overview.aiSpendAction')}
      href="/dashboard/admin/ai-usage"
    />
  )
}
