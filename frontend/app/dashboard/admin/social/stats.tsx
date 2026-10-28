'use client'

/** Social studio stats (posts per platform per week, visits from social links) and AI settings. */
import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Panel, StatCard } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { useAdminT } from '@/lib/i18n/admin'
import type { SocialSettings } from '@/lib/social/settings'
import { PLATFORM_LABELS, SOCIAL_PLATFORMS, type SocialPlatform } from '@/lib/social/types'

type Stats = { weeks: { week: string; counts: Record<SocialPlatform, number> }[]; visits: { source: string; campaign: string; visits: number }[] | null }
type Ai = { draftsToday?: number; spentUsd?: number; cap?: number; monthlyCapUsd?: number; blocked?: string | null }

export function SocialStats() {
  const { t, td, fmt } = useAdminT()
  const addToast = useToast()
  const [stats, setStats] = useState<Stats | null>(null)
  const [settings, setSettings] = useState<SocialSettings | null>(null)
  const [ai, setAi] = useState<Ai | null>(null)
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setError(false)
    try {
      const [s, q] = await Promise.all([fetch('/api/admin/social/stats', { cache: 'no-store' }), fetch('/api/admin/social?page=1', { cache: 'no-store' })])
      const [sd, qd] = await Promise.all([s.json().catch(() => null), q.json().catch(() => null)])
      if (!s.ok || !q.ok || !sd || !qd) throw new Error('load')
      setStats(sd)
      setSettings(qd.settings)
      setAi(qd.ai)
    } catch {
      setError(true)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const r = await csrfFetch('/api/admin/social', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'settings', patch: settings }) })
      if (!r.ok) throw new Error('save')
      addToast({ type: 'success', title: t('common.saved') })
      void load()
    } catch {
      addToast({ type: 'error', title: t('social.err.action') })
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return (
      <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p role="alert" className="text-sm text-destructive">{t('social.err.load')}</p>
        <Button type="button" variant="outline" onClick={() => void load()}>{t('common.tryAgain')}</Button>
      </Panel>
    )
  }
  if (!stats || !settings) return <SkeletonList count={4} />

  const totals = Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p, stats.weeks.reduce((n, w) => n + (w.counts[p] || 0), 0)])) as Record<SocialPlatform, number>
  const thisWeek = stats.weeks[0] ? SOCIAL_PLATFORMS.reduce((n, p) => n + (stats.weeks[0].counts[p] || 0), 0) : 0
  const visitTotal = stats.visits?.reduce((n, v) => n + v.visits, 0) ?? null

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('social.statThisWeek')} value={fmt.number(thisWeek)} />
        <StatCard label={t('social.statEightWeeks')} value={fmt.number(SOCIAL_PLATFORMS.reduce((n, p) => n + totals[p], 0))} />
        <StatCard label={t('social.statVisits')} value={visitTotal === null ? '—' : fmt.number(visitTotal)} hint={visitTotal === null ? t('social.visitsUnavailable') : t('social.visitsHint')} />
      </div>

      <Panel className="p-4 sm:p-6">
        <h2 className="mb-3 text-lg font-semibold">{t('social.postsPerWeek')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">{t('social.week')}</th>
                {SOCIAL_PLATFORMS.map((p) => <th key={p} scope="col" className="px-2 py-2 text-right font-medium">{PLATFORM_LABELS[p]}</th>)}
              </tr>
            </thead>
            <tbody>
              {stats.weeks.map((w) => (
                <tr key={w.week} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="py-2 pr-3 text-left font-normal tabular-nums">{w.week}</th>
                  {SOCIAL_PLATFORMS.map((p) => <td key={p} className="px-2 py-2 text-right tabular-nums">{fmt.number(w.counts[p] || 0)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel className="p-4 sm:p-6">
        <h2 className="mb-1 text-lg font-semibold">{t('social.visitsTitle')}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{t('social.visitsExplain')}</p>
        {!stats.visits ? (
          <p className="text-sm text-muted-foreground">{t('social.visitsUnavailable')}</p>
        ) : !stats.visits.length ? (
          <p className="text-sm text-muted-foreground">{t('social.visitsNone')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-medium">{t('social.platform')}</th>
                  <th scope="col" className="py-2 pr-3 font-medium">{t('common.type')}</th>
                  <th scope="col" className="py-2 text-right font-medium">{t('social.visits')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.visits.map((v) => (
                  <tr key={`${v.source}:${v.campaign}`} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3">{PLATFORM_LABELS[v.source as SocialPlatform] ?? v.source}</td>
                    <td className="py-2 pr-3">{td(`social.type.${v.campaign}`, v.campaign || '—')}</td>
                    <td className="py-2 text-right tabular-nums">{fmt.number(v.visits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel className="space-y-4 p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">{t('social.aiSettings')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('social.aiUsage', { drafts: ai?.draftsToday ?? 0, cap: settings.daily_ai_cap, spent: (ai?.spentUsd ?? 0).toFixed(2), monthCap: settings.monthly_cost_cap_usd.toFixed(2) })}
          </p>
          {ai?.blocked ? <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">{td(`social.fallback.${ai.blocked}`, ai.blocked)}</p> : null}
        </div>
        <div className="flex items-center gap-3">
          <Switch id="social-ai" checked={settings.ai_enabled} onCheckedChange={(v) => setSettings({ ...settings, ai_enabled: v })} />
          <Label htmlFor="social-ai">{t('social.aiEnabled')}</Label>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="social-daily">{t('social.dailyCap')}</Label>
            <Input id="social-daily" type="number" inputMode="numeric" min={0} max={1000} value={settings.daily_ai_cap}
              onChange={(e) => setSettings({ ...settings, daily_ai_cap: Math.max(0, Math.min(1000, Math.floor(Number(e.target.value) || 0))) })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="social-monthly">{t('social.monthlyCap')}</Label>
            <Input id="social-monthly" type="number" inputMode="decimal" min={0} max={500} step="0.5" value={settings.monthly_cost_cap_usd}
              onChange={(e) => setSettings({ ...settings, monthly_cost_cap_usd: Math.max(0, Math.min(500, Number(e.target.value) || 0)) })} />
          </div>
        </div>
        <Button type="button" onClick={save} disabled={saving} className="min-h-11">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}{t('common.save')}
        </Button>
      </Panel>
    </div>
  )
}
