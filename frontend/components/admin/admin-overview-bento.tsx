'use client'

/**
 * Admin home bento: users, MRR, tests today, integrity flags, AI usage.
 * Reuses /api/admin/metrics (users) and /api/admin/billing/metrics (MRR per
 * currency, never summed across currencies); /api/admin/overview adds the
 * day series. Each card loads, fails and empties on its own.
 */
import { useEffect, useState } from 'react'
import { Bot, Coins, ShieldAlert, Users } from 'lucide-react'
import { AnimatedIcon } from '@/components/icons/AnimatedIcon'
import { BentoEmpty, BentoGrid, BentoStat, MiniBars } from '@/components/bento'
import { useAdminT } from '@/lib/i18n/admin'
import type { AdminOverview } from '@/lib/admin/overview'

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
        <BentoStat
          span={3}
          smSpan={1}
          icon={<Bot />}
          title={t('overview.ai')}
          loading={ov.loading}
          loadingLabel={loading}
          value={ov.data ? number(ov.data.ai.requests) : undefined}
          unit={ov.data ? t('overview.aiUnit') : undefined}
          hint={ov.data ? <>{t('overview.aiHint', { tokens: number(ov.data.ai.tokens), failed: number(ov.data.ai.failed) })}<span className="mt-1 block text-xs">{t('overview.aiNote')}</span></> : undefined}
          empty={ov.error ? failed : undefined}
          series={ov.data?.ai.by_day}
          seriesLabel={t('overview.aiTrend')}
        />
      </BentoGrid>
    </section>
  )
}
