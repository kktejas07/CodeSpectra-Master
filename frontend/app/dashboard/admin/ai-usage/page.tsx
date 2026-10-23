'use client'

/**
 * /dashboard/admin/ai-usage — what AI costs: spend by day, feature,
 * model/provider and tenant (USD + INR), this month vs last, the platform
 * budget (alerts at 50/80/100 %, optional hard stop), CSV export and the
 * price book editor. Data: /api/admin/ai-usage (superadmin).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CircleDollarSign, Download, Gauge, Loader2, Plus, RefreshCw, RotateCcw, Save, TrendingUp, Wallet } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useAdminT } from '@/lib/i18n/admin'
import { PageHeader, Panel, Section, StatCard } from '@/components/app/page-kit'
import { BarRows, MiniBars } from '@/components/bento'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { microsIn, moneyDigits, noPlatformAiCeiling, type AiCostSettings, type SpendBucket } from '@/lib/ai/spend'
import { priceKey, SEED_PRICES, type ModelPrice, type PriceKind, type UnknownPrice } from '@/lib/ai/pricing'

interface UsageData {
  days: number
  dayKeys: string[]
  byDayMicros: number[]
  totals: SpendBucket
  byFeature: SpendBucket[]
  byModel: (SpendBucket & { provider: string; model: string; unpriced: boolean })[]
  byTenant: SpendBucket[]
  month: {
    month: string; micros: number; estimatedMicros: number; lastMonthToDateMicros: number; lastMonthMicros: number
    trendPct: number | null; top: { feature: string; micros: number }[]; unpricedCalls: number; usdInrRate: number; usdInrRateUpdatedAt: string | null
    budget: { usd: number; level: 0 | 50 | 80 | 100; hardStop: boolean }
  }
  settings: AiCostSettings
  book: { prices: ModelPrice[]; unknown: UnknownPrice; seedNote: string }
}

const RANGES = [7, 30, 90, 365] as const

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await csrfFetch(url, { headers: { 'Content-Type': 'application/json' }, credentials: 'include', ...init })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((d as { error?: string }).error || 'Request failed')
  return d as T
}

function useMoney(rate: number) {
  const { fmt } = useAdminT()
  return useCallback((micros: number, currency: 'USD' | 'INR' = 'USD') => {
    const amount = microsIn(micros, currency, rate)
    const digits = moneyDigits(amount)
    return fmt.number(amount, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits })
  }, [fmt, rate])
}

// ─── Budget settings ────────────────────────────────────────────────────────

function BudgetPanel({ settings, onSaved }: { settings: AiCostSettings; onSaved: () => void }) {
  const { t, fmt } = useAdminT()
  const addToast = useToast()
  const [budget, setBudget] = useState(String(settings.monthly_budget_usd))
  const [rate, setRate] = useState(String(settings.usd_inr_rate))
  const [hardStop, setHardStop] = useState(settings.hard_stop)
  const [features, setFeatures] = useState(settings.non_critical_features.join(', '))
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    setBudget(String(settings.monthly_budget_usd)); setRate(String(settings.usd_inr_rate))
    setHardStop(settings.hard_stop); setFeatures(settings.non_critical_features.join(', '))
  }, [settings])

  const save = async () => {
    setSaving(true)
    try {
      await api('/api/admin/ai-usage', {
        method: 'PATCH',
        body: JSON.stringify({
          monthly_budget_usd: Number(budget) || 0,
          usd_inr_rate: Number(rate) || settings.usd_inr_rate,
          hard_stop: hardStop,
          non_critical_features: features.split(/[\s,]+/).map((f) => f.trim()).filter(Boolean),
        }),
      })
      addToast({ type: 'success', title: t('aiCost.saved') })
      onSaved()
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel className="space-y-5 p-5">
      {noPlatformAiCeiling(settings) && (
        <p role="status" className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">{t('aiCost.noCeilingWarning')}</p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="ai-budget" className="text-xs">{t('aiCost.budgetLabel')}</Label>
          <Input id="ai-budget" type="number" inputMode="decimal" min={0} step="1" value={budget} onChange={(e) => setBudget(e.target.value)} className="mt-1 tabular-nums" />
          <p className="mt-1 text-xs text-muted-foreground">{t('aiCost.budgetHint')}</p>
        </div>
        <div>
          <Label htmlFor="ai-rate" className="text-xs">{t('aiCost.rateLabel')}</Label>
          <Input id="ai-rate" type="number" inputMode="decimal" min={1} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="mt-1 tabular-nums" />
          <p className="mt-1 text-xs text-muted-foreground">{t('aiCost.rateHint')}{settings.usd_inr_rate_updated_at ? ` ${t('aiCost.rateUpdated', { date: fmt.date(settings.usd_inr_rate_updated_at) })}` : ''}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border p-4">
        <div className="min-w-0 max-w-prose">
          <p className="font-medium text-foreground">{t('aiCost.hardStop')}</p>
          <p className="text-sm text-muted-foreground">{t('aiCost.hardStopHint')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="ai-hard-stop" checked={hardStop} onCheckedChange={setHardStop} />
          <Label htmlFor="ai-hard-stop">{hardStop ? t('aiCost.on') : t('aiCost.off')}</Label>
        </div>
      </div>
      <div>
        <Label htmlFor="ai-noncritical" className="text-xs">{t('aiCost.nonCritical')}</Label>
        <Textarea id="ai-noncritical" rows={3} value={features} onChange={(e) => setFeatures(e.target.value)} className="mt-1 font-mono text-xs" />
        <p className="mt-1 text-xs text-muted-foreground">{t('aiCost.nonCriticalHint')}</p>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={saving} className="min-h-11 gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          {t('aiCost.saveBudget')}
        </Button>
      </div>
    </Panel>
  )
}

// ─── Price book ─────────────────────────────────────────────────────────────

type Row = ModelPrice & { _k: string }
const KINDS: PriceKind[] = ['chat', 'embedding', 'speech', 'image']
const seeds = new Set(SEED_PRICES.map(priceKey))

function PriceBook({ book, settings, onSaved }: { book: UsageData['book']; settings: AiCostSettings; onSaved: () => void }) {
  const { t } = useAdminT()
  const addToast = useToast()
  const initial = useMemo<Row[]>(() => book.prices.map((p) => ({ ...p, _k: priceKey(p) })), [book.prices])
  const [rows, setRows] = useState<Row[]>(initial)
  const [unknown, setUnknown] = useState<UnknownPrice>(book.unknown)
  const [filter, setFilter] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  useEffect(() => { setRows(initial); setUnknown(book.unknown); setDirty(false) }, [initial, book.unknown])

  const edit = (k: string, patch: Partial<ModelPrice>) => {
    setDirty(true)
    setRows((rs) => rs.map((r) => (r._k === k ? { ...r, ...patch, source: 'admin' } : r)))
  }
  const add = () => {
    setDirty(true)
    const k = `new-${Date.now()}`
    setRows((rs) => [{ _k: k, match: '', kind: 'chat', inputPer1M: 0, outputPer1M: 0, source: 'admin' }, ...rs])
    setFilter('')
  }
  const numOr = (v: string): number | undefined => (v === '' ? undefined : Number(v))

  const save = async (reset?: string) => {
    setSaving(true)
    try {
      // Only admin rows are stored; a seed row reset drops its override.
      const prices = rows
        .filter((r) => r.source === 'admin' && r._k !== reset && r.match.trim())
        .map(({ _k, source, ...p }) => p)
      await api('/api/admin/ai-usage', { method: 'PATCH', body: JSON.stringify({ prices, unknown }) })
      addToast({ type: 'success', title: t('aiCost.saved') })
      onSaved()
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const shown = rows.filter((r) => !filter || r.match.includes(filter.toLowerCase()) || (r.provider || '').includes(filter.toLowerCase()))
  const overridden = new Set(settings.prices.map(priceKey))
  const cell = 'h-9 w-24 tabular-nums text-sm'

  return (
    <Panel className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input aria-label={t('aiCost.filterModels')} placeholder={t('aiCost.filterModels')} value={filter} onChange={(e) => setFilter(e.target.value)} className="h-10 w-full sm:w-64" />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={add} className="min-h-11 gap-1.5"><Plus className="h-4 w-4" aria-hidden />{t('aiCost.addModel')}</Button>
          <Button onClick={() => void save()} disabled={saving || !dirty} className="min-h-11 gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            {t('aiCost.savePrices')}
          </Button>
        </div>
      </div>
      <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {t('aiCost.seedWarning')}
      </p>
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[900px] text-left text-sm">
          <caption className="sr-only">{t('aiCost.priceBook')}</caption>
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="py-2 pr-3 font-medium">{t('aiCost.model')}</th>
              <th scope="col" className="py-2 pr-3 font-medium">{t('aiCost.provider')}</th>
              <th scope="col" className="py-2 pr-3 font-medium">{t('aiCost.kind')}</th>
              <th scope="col" className="py-2 pr-3 font-medium">{t('aiCost.inputPer1M')}</th>
              <th scope="col" className="py-2 pr-3 font-medium">{t('aiCost.outputPer1M')}</th>
              <th scope="col" className="py-2 pr-3 font-medium">{t('aiCost.cachedPer1M')}</th>
              <th scope="col" className="py-2 pr-3 font-medium">{t('aiCost.perMinute')}</th>
              <th scope="col" className="py-2 pr-3 font-medium">{t('aiCost.perImage')}</th>
              <th scope="col" className="py-2 font-medium"><span className="sr-only">{t('common.actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const speech = r.kind === 'speech'
              const image = r.kind === 'image'
              return (
                <tr key={r._k} className="border-b border-border/60 align-middle">
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <Input aria-label={t('aiCost.model')} value={r.match} onChange={(e) => edit(r._k, { match: e.target.value.toLowerCase() })} className="h-9 w-48 font-mono text-xs" disabled={seeds.has(r._k)} />
                      {r.source === 'admin' || overridden.has(r._k)
                        ? <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">{t('aiCost.sourceAdmin')}</Badge>
                        : <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" title={book.seedNote}>{t('aiCost.sourceSeed')}</Badge>}
                    </div>
                  </td>
                  <td className="py-2 pr-3"><Input aria-label={t('aiCost.provider')} value={r.provider ?? ''} placeholder={t('aiCost.anyProvider')} onChange={(e) => edit(r._k, { provider: e.target.value.toLowerCase() || undefined })} className="h-9 w-28 text-sm" disabled={seeds.has(r._k)} /></td>
                  <td className="py-2 pr-3">
                    <select aria-label={t('aiCost.kind')} value={r.kind} onChange={(e) => edit(r._k, { kind: e.target.value as PriceKind })} disabled={seeds.has(r._k)}
                      className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {KINDS.map((k) => <option key={k} value={k}>{t(`aiCost.kind_${k}` as 'aiCost.kind_chat')}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-3">{!speech && !image && <Input aria-label={t('aiCost.inputPer1M')} type="number" inputMode="decimal" min={0} step="0.001" value={r.inputPer1M ?? ''} onChange={(e) => edit(r._k, { inputPer1M: numOr(e.target.value) })} className={cell} />}</td>
                  <td className="py-2 pr-3">{r.kind === 'chat' && <Input aria-label={t('aiCost.outputPer1M')} type="number" inputMode="decimal" min={0} step="0.001" value={r.outputPer1M ?? ''} onChange={(e) => edit(r._k, { outputPer1M: numOr(e.target.value) })} className={cell} />}</td>
                  <td className="py-2 pr-3">{r.kind === 'chat' && <Input aria-label={t('aiCost.cachedPer1M')} type="number" inputMode="decimal" min={0} step="0.001" value={r.cachedInputPer1M ?? ''} onChange={(e) => edit(r._k, { cachedInputPer1M: numOr(e.target.value) })} className={cell} />}</td>
                  <td className="py-2 pr-3">{speech && <Input aria-label={t('aiCost.perMinute')} type="number" inputMode="decimal" min={0} step="0.0001" value={r.perMinute ?? ''} onChange={(e) => edit(r._k, { perMinute: numOr(e.target.value) })} className={cell} />}</td>
                  <td className="py-2 pr-3">{image && (
                    <div className="flex items-center gap-2">
                      <Input aria-label={t('aiCost.perImage')} type="number" inputMode="decimal" min={0} step="0.001" value={r.perImage ?? ''} onChange={(e) => edit(r._k, { perImage: numOr(e.target.value) })} className={cell} />
                      <Input aria-label={t('aiCost.imageSize')} placeholder={t('aiCost.anySize')} value={r.size ?? ''} onChange={(e) => edit(r._k, { size: e.target.value.toLowerCase() || undefined })} className="h-9 w-28 font-mono text-xs" disabled={seeds.has(r._k)} />
                    </div>
                  )}</td>
                  <td className="py-2 text-right">
                    {overridden.has(r._k) && seeds.has(r._k) && (
                      <Button variant="ghost" size="sm" onClick={() => void save(r._k)} disabled={saving} className="gap-1" aria-label={t('aiCost.resetSeed')}>
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden /><span className="hidden lg:inline">{t('aiCost.resetSeed')}</span>
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="rounded-2xl border border-border p-4">
        <p className="font-medium text-foreground">{t('aiCost.unknownTitle')}</p>
        <p className="text-sm text-muted-foreground">{t('aiCost.unknownHint')}</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(['inputPer1M', 'outputPer1M', 'perMinute', 'perImage'] as const).map((k) => (
            <div key={k}>
              <Label htmlFor={`unk-${k}`} className="text-xs">{t(`aiCost.${k}`)}</Label>
              <Input id={`unk-${k}`} type="number" inputMode="decimal" min={0} step="0.001" value={unknown[k] ?? ''} onChange={(e) => { setDirty(true); setUnknown((u) => ({ ...u, [k]: Number(e.target.value) || 0 })) }} className="mt-1 tabular-nums" />
            </div>
          ))}
        </div>
      </div>
    </Panel>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AiUsagePage() {
  const { t, fmt } = useAdminT()
  const gate = usePageGuard('superadmin')
  const [days, setDays] = useState<(typeof RANGES)[number]>(30)
  const [data, setData] = useState<UsageData | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const money = useMoney(data?.month.usdInrRate ?? 0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api<UsageData>(`/api/admin/ai-usage?days=${days}`))
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [days])
  useEffect(() => { if (gate.ready) void load() }, [gate.ready, load])

  if (!gate.ready) return null
  const m = data?.month
  const budgetPct = m && m.budget.usd > 0 ? Math.round((m.micros / (m.budget.usd * 1e6)) * 100) : null
  const unpricedModels = data?.byModel.filter((r) => r.unpriced) ?? []

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('aiCost.title')}
        description={t('aiCost.description')}
        icon={<CircleDollarSign />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label={t('aiCost.range')} className="inline-flex rounded-xl border border-border p-1">
              {RANGES.map((r) => (
                <button key={r} type="button" onClick={() => setDays(r)} aria-pressed={days === r}
                  className={`min-h-9 rounded-lg px-3 text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${days === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                  {t('aiCost.days', { n: r })}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <a href={`/api/admin/ai-usage?days=${days}&format=csv`} download><Download className="h-3.5 w-3.5" aria-hidden />{t('aiCost.exportCsv')}</a>
            </Button>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" aria-hidden />{t('common.refresh')}</Button>
          </div>
        }
      />

      {error && !data ? (
        <EmptyState illustration="error" title={t('aiCost.loadFailed')} description={t('common.checkConnection')} actionLabel={t('common.tryAgain')} onAction={() => void load()} />
      ) : !data || !m ? (
        <SkeletonList />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t('aiCost.thisMonth')} value={<span className="tabular-nums">{money(m.micros)}</span>} icon={<Wallet />}
              hint={<><span className="tabular-nums">{money(m.micros, 'INR')}</span><span className="block text-xs">{m.usdInrRateUpdatedAt
                ? t('aiCost.rateSetBy', { rate: fmt.number(m.usdInrRate), date: fmt.date(m.usdInrRateUpdatedAt) })
                : t('aiCost.rateDefault', { rate: fmt.number(m.usdInrRate) })}</span></>} />
            <StatCard label={t('aiCost.vsLastMonth')} icon={<TrendingUp />}
              value={<span className="tabular-nums">{m.trendPct === null ? '—' : `${m.trendPct > 0 ? '+' : ''}${fmt.number(m.trendPct, { maximumFractionDigits: 1 })}%`}</span>}
              hint={t('aiCost.lastMonthHint', { sameDays: money(m.lastMonthToDateMicros), total: money(m.lastMonthMicros) })} />
            <StatCard label={t('aiCost.budget')} icon={<Gauge />}
              value={<span className="tabular-nums">{budgetPct === null ? t('aiCost.noBudget') : `${budgetPct}%`}</span>}
              hint={m.budget.usd > 0 ? t('aiCost.budgetOf', { budget: money(m.budget.usd * 1e6) }) + (m.budget.hardStop ? ` · ${t('aiCost.hardStopOn')}` : '') : t('aiCost.setBudgetBelow')} />
            <StatCard label={t('aiCost.unpriced')} icon={<AlertTriangle />}
              value={<span className="tabular-nums">{fmt.number(m.unpricedCalls)}</span>}
              hint={m.estimatedMicros > 0 ? t('aiCost.estimatedPart', { amount: money(m.estimatedMicros) }) : t('aiCost.unpricedHint')} />
          </div>

          {data.totals.calls === 0 ? (
            <EmptyState illustration="inbox" title={t('aiCost.emptyTitle')} description={t('aiCost.emptyHint')} />
          ) : (
            <>
              <Section title={t('aiCost.byDay')} description={t('aiCost.byDayHint', { total: money(data.totals.micros), n: data.days })}>
                <Panel className="p-5">
                  <MiniBars data={data.byDayMicros} label={t('aiCost.byDayChart', { n: data.days })} className="h-32" />
                  <div className="mt-2 flex justify-between text-xs tabular-nums text-muted-foreground">
                    <span>{fmt.date(`${data.dayKeys[0]}T00:00:00Z`)}</span>
                    <span>{fmt.date(`${data.dayKeys[data.dayKeys.length - 1]}T00:00:00Z`)}</span>
                  </div>
                </Panel>
              </Section>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Section title={t('aiCost.byFeature')}>
                  <Panel className="p-5">
                    <BarRows rows={data.byFeature.slice(0, 12).map((f) => ({ label: f.key, value: f.micros, hint: t('aiCost.calls', { n: fmt.number(f.calls) }) }))} format={(n) => money(n)} />
                  </Panel>
                </Section>
                <Section title={t('aiCost.byTenant')}>
                  <Panel className="p-5">
                    <BarRows rows={data.byTenant.slice(0, 12).map((f) => ({ label: f.key === 'platform' ? t('aiCost.platform') : f.key, value: f.micros, hint: t('aiCost.calls', { n: fmt.number(f.calls) }) }))} format={(n) => money(n)} />
                  </Panel>
                </Section>
              </div>

              <Section title={t('aiCost.byModel')} description={unpricedModels.length ? t('aiCost.unpricedModels', { n: unpricedModels.length }) : undefined}>
                <Panel className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="text-xs text-muted-foreground">
                        <tr className="border-b border-border">
                          <th scope="col" className="px-5 py-3 font-medium">{t('aiCost.model')}</th>
                          <th scope="col" className="px-3 py-3 font-medium">{t('aiCost.provider')}</th>
                          <th scope="col" className="px-3 py-3 text-right font-medium">{t('aiCost.callsCol')}</th>
                          <th scope="col" className="px-3 py-3 text-right font-medium">{t('aiCost.tokens')}</th>
                          <th scope="col" className="px-5 py-3 text-right font-medium">{t('aiCost.cost')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.byModel.slice(0, 50).map((r) => (
                          <tr key={r.key} className="border-b border-border/60 last:border-0">
                            <td className="px-5 py-2.5">
                              <span className="font-mono text-xs text-foreground">{r.model}</span>
                              {r.unpriced && <Badge variant="outline" className="ml-2 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">{t('aiCost.noPrice')}</Badge>}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">{r.provider}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{fmt.number(r.calls)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{fmt.number(r.tokens)}</td>
                            <td className="px-5 py-2.5 text-right tabular-nums font-medium">{money(r.micros)}{r.estimatedMicros > 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">{t('aiCost.est')}</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </Section>
            </>
          )}

          <Section title={t('aiCost.budgetTitle')} description={t('aiCost.budgetDescription')}>
            <BudgetPanel settings={data.settings} onSaved={() => void load()} />
          </Section>

          <Section title={t('aiCost.priceBook')} description={t('aiCost.priceBookDescription')}>
            <PriceBook book={data.book} settings={data.settings} onSaved={() => void load()} />
          </Section>
        </>
      )}
    </div>
  )
}
