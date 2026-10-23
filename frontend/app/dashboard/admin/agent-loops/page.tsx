'use client'

/**
 * Admin → Agent loops (superadmin). The scheduled agents that look over the
 * platform and propose work: content QA, SEO / content gaps, community
 * moderator, analytics insights and the daily social pack. Switch each on or
 * off, set its AI caps and schedule, run it now, read its run log and apply
 * or dismiss what it found. Nothing a loop proposes runs without a click here
 * (or a confirmed copilot action).
 */
import { useCallback, useEffect, useState } from 'react'
import { Bot, Check, ExternalLink, Loader2, Play, X } from 'lucide-react'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useAdminT } from '@/lib/i18n/admin'
import { isAgentLoopId, type AgentLoopDef, type AgentLoopId } from '@/lib/agent-loops/registry'
import type { AgentLoopSettings } from '@/lib/agent-loops/settings'
import type { FindingDoc, LoopRunDoc } from '@/lib/agent-loops/types'
import { CAPTION_LANGS } from '@/lib/social/types'

type LoopRow = AgentLoopDef & { settings: AgentLoopSettings; ai: { calls_today: number; spent_month_usd: number }; last_run: LoopRunDoc | null; open: number }
type StatusFilter = 'open' | 'applied' | 'dismissed' | 'failed' | 'any'
const SEVERITY_CLASS: Record<string, string> = {
  critical: 'border-red-600/40 text-red-700 dark:text-red-400',
  warning: 'border-amber-600/40 text-amber-700 dark:text-amber-400',
  info: 'border-border text-muted-foreground',
}

export default function AgentLoopsPage() {
  const { t, td, fmt } = useAdminT()
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [loops, setLoops] = useState<LoopRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState<AgentLoopId | null>(null)
  const [status, setStatus] = useState<StatusFilter>('open')
  const [runs, setRuns] = useState<LoopRunDoc[]>([])
  const [findings, setFindings] = useState<FindingDoc[]>([])
  const [search, setSearch] = useState<{ queries: number; last_seen: string | null } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [csv, setCsv] = useState('')

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('loop')
    if (isAgentLoopId(q)) setSelected(q)
  }, [])

  const load = useCallback(async () => {
    setError(false)
    if (selected) setDetailLoading(true)
    try {
      const sp = new URLSearchParams(selected ? { loop: selected, status } : {})
      const r = await fetch(`/api/admin/agent-loops?${sp}`, { cache: 'no-store' })
      const d = await r.json().catch(() => null)
      if (!r.ok || !d) throw new Error('load')
      setLoops(d.loops || [])
      setRuns(d.runs || [])
      setFindings(d.findings || [])
      setSearch(d.search ?? null)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
      setDetailLoading(false)
    }
  }, [selected, status])

  useEffect(() => { if (gate.allowed) void load() }, [gate.allowed, load])

  const post = async (body: Record<string, unknown>, key: string) => {
    setBusy(key)
    try {
      const r = await csrfFetch('/api/admin/agent-loops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => null)
      return { ok: r.ok, d }
    } finally {
      setBusy(null)
    }
  }

  const saveSettings = async (loop: AgentLoopId, patch: Partial<AgentLoopSettings>) => {
    const { ok, d } = await post({ action: 'settings', loop, patch }, `settings:${loop}`)
    if (!ok) { addToast({ type: 'error', title: t('agentLoops.err.save') }); return }
    setLoops((list) => list.map((l) => (l.id === loop ? { ...l, settings: d.settings } : l)))
    addToast({ type: 'success', title: t('agentLoops.saved') })
  }

  const runNow = async (loop: AgentLoopId) => {
    const { ok, d } = await post({ action: 'run', loop }, `run:${loop}`)
    if (!ok) { addToast({ type: 'error', title: d?.code === 'rate_limited_shortly' ? t('agentLoops.err.busy') : t('agentLoops.err.run') }); return }
    addToast({ type: 'success', title: t('agentLoops.ranNow', { count: d?.run?.findings ?? 0 }) })
    void load()
  }

  const decide = async (f: FindingDoc, decision: 'apply' | 'dismiss') => {
    const { ok, d } = await post({ action: 'decide', id: f.id, decision }, `decide:${f.id}`)
    if (d?.finding) setFindings((list) => list.map((x) => (x.id === f.id ? d.finding : x)))
    addToast(ok ? { type: 'success', title: decision === 'apply' ? t('agentLoops.applied') : t('agentLoops.dismissed') } : { type: 'error', title: t('agentLoops.err.apply') })
  }

  const importCsv = async () => {
    const { ok, d } = await post({ action: 'search-console', csv }, 'csv')
    if (!ok) { addToast({ type: 'error', title: t('agentLoops.err.csv') }); return }
    setCsv('')
    addToast({ type: 'success', title: t('agentLoops.csvImported', { count: d?.kept ?? 0 }) })
    void load()
  }

  const pick = (id: AgentLoopId | null) => {
    setSelected(id)
    setStatus('open')
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('loop', id)
    else url.searchParams.delete('loop')
    window.history.replaceState(null, '', url)
  }

  if (gate.loading) return <SkeletonList count={5} />
  const current = loops.find((l) => l.id === selected) ?? null
  const weekday = (n: number) => fmt.date(new Date(Date.UTC(2026, 0, 4 + n)), { weekday: 'long', timeZone: 'UTC' })

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader title={t('agentLoops.title')} description={t('agentLoops.description')} icon={<Bot />} />

      {error ? (
        <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p role="alert" className="text-sm text-destructive">{t('agentLoops.err.load')}</p>
          <Button type="button" variant="outline" onClick={() => void load()}>{t('common.tryAgain')}</Button>
        </Panel>
      ) : null}

      {loading ? <SkeletonList count={5} /> : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {loops.map((l) => (
            <li key={l.id}>
              <Panel interactive className={`flex h-full flex-col gap-3 p-4 ${selected === l.id ? 'ring-2 ring-ring' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-foreground">{td(`agentLoops.loop.${l.id}`, l.id)}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{td(`agentLoops.loopHint.${l.id}`, '')}</p>
                  </div>
                  <Switch
                    checked={l.settings.enabled}
                    disabled={busy === `settings:${l.id}`}
                    onCheckedChange={(v) => void saveSettings(l.id, { enabled: v })}
                    aria-label={t('agentLoops.switchLabel', { name: td(`agentLoops.loop.${l.id}`, l.id) })}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <Badge variant={l.settings.enabled ? 'default' : 'secondary'}>{l.settings.enabled ? t('agentLoops.on') : t('agentLoops.off')}</Badge>
                  <Badge variant="outline">{td(`agentLoops.cadence.${l.cadence}`, l.cadence)}</Badge>
                  {l.messagesPeople ? <Badge variant="outline">{t('agentLoops.badge.messages')}</Badge> : null}
                  {l.changesContent ? <Badge variant="outline">{t('agentLoops.badge.changes')}</Badge> : null}
                  {l.usesAi ? <Badge variant="outline">{t('agentLoops.badge.ai')}</Badge> : null}
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">{t('agentLoops.lastRun')}</dt>
                    <dd className="text-foreground">
                      {l.last_run ? (
                        <span className={l.last_run.status === 'error' ? 'text-destructive' : ''}>
                          {fmt.relative(l.last_run.started_at)} · {td(`agentLoops.runStatus.${l.last_run.status}`, l.last_run.status)}
                        </span>
                      ) : t('agentLoops.never')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('agentLoops.openFindings')}</dt>
                    <dd className="tabular-nums text-foreground">{fmt.number(l.open)}</dd>
                  </div>
                </dl>
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Button type="button" className="min-h-11 flex-1" variant={selected === l.id ? 'default' : 'outline'} onClick={() => pick(selected === l.id ? null : l.id)} aria-expanded={selected === l.id}>
                    {selected === l.id ? t('agentLoops.close') : t('agentLoops.open')}
                  </Button>
                  <Button type="button" variant="outline" className="min-h-11" disabled={busy === `run:${l.id}`} onClick={() => void runNow(l.id)}>
                    {busy === `run:${l.id}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Play className="mr-2 h-4 w-4" aria-hidden />}
                    {t('agentLoops.runNow')}
                  </Button>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}

      {current ? (
        <section aria-labelledby="loop-detail" className="space-y-4">
          <h2 id="loop-detail" className="text-lg font-semibold text-foreground">{td(`agentLoops.loop.${current.id}`, current.id)}</h2>

          <Panel className="space-y-4 p-4">
            <h3 className="font-medium text-foreground">{t('agentLoops.settings')}</h3>
            <LoopSettingsForm key={`${current.id}:${JSON.stringify(current.settings)}`} loop={current} busy={busy === `settings:${current.id}`} weekday={weekday} onSave={(p) => void saveSettings(current.id, p)} />
            {current.usesAi ? (
              <p className="text-sm text-muted-foreground">
                {t('agentLoops.aiUse', { calls: current.ai.calls_today, cap: current.settings.daily_ai_cap, spent: current.ai.spent_month_usd.toFixed(2), monthCap: current.settings.monthly_cost_cap_usd.toFixed(2) })}
              </p>
            ) : null}
            {current.id === 'social-pack' ? (
              <Button asChild variant="outline" className="min-h-11">
                <a href="/dashboard/admin/social?tab=pack"><ExternalLink className="mr-2 h-4 w-4" aria-hidden />{t('agentLoops.openPack')}</a>
              </Button>
            ) : null}
          </Panel>

          {current.id === 'seo-gap' ? (
            <Panel className="space-y-3 p-4">
              <h3 className="font-medium text-foreground">{t('agentLoops.seo.dataTitle')}</h3>
              <p className="text-sm text-muted-foreground">{search ? t('agentLoops.seo.dataSummary', { count: search.queries }) : t('agentLoops.seo.dataNone')}</p>
              <Label htmlFor="gsc-csv">{t('agentLoops.seo.csvLabel')}</Label>
              <Textarea id="gsc-csv" value={csv} onChange={(e) => setCsv(e.target.value)} rows={4} maxLength={500_000} placeholder={t('agentLoops.seo.csvPlaceholder')} />
              <Button type="button" variant="outline" className="min-h-11" disabled={!csv.trim() || busy === 'csv'} onClick={() => void importCsv()}>{t('agentLoops.seo.import')}</Button>
            </Panel>
          ) : null}

          <Panel className="space-y-3 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h3 className="font-medium text-foreground">{t('agentLoops.findings')}</h3>
              <div className="space-y-1">
                <Label htmlFor="finding-status">{t('common.status')}</Label>
                <select id="finding-status" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {(['open', 'applied', 'dismissed', 'failed', 'any'] as const).map((s) => <option key={s} value={s}>{t(`agentLoops.status.${s}`)}</option>)}
                </select>
              </div>
            </div>
            {detailLoading ? <SkeletonList count={3} /> : !findings.length ? (
              <EmptyState compact title={t('agentLoops.emptyFindings')} description={t('agentLoops.emptyFindingsHint')} />
            ) : (
              <ul className="divide-y divide-border">
                {findings.map((f) => (
                  <li key={f.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={SEVERITY_CLASS[f.severity]}>{t(`agentLoops.severity.${f.severity}`)}</Badge>
                        <span className="font-medium text-foreground">{td(`agentLoops.kind.${f.kind}`, f.kind, f.params)}</span>
                      </div>
                      {f.target.label ? (
                        <p className="text-sm text-foreground">
                          {f.target.url ? <a className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={f.target.url} target="_blank" rel="noopener noreferrer">{f.target.label}</a> : f.target.label}
                        </p>
                      ) : null}
                      {f.detail ? <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-muted p-2 text-xs text-foreground">{f.detail}</pre> : null}
                      {f.result?.message ? <p className={`text-xs ${f.result.ok ? 'text-muted-foreground' : 'text-destructive'}`}>{f.result.message}</p> : null}
                      <p className="text-xs text-muted-foreground"><time dateTime={f.updated_at}>{fmt.relative(f.updated_at)}</time> · {t(`agentLoops.status.${f.status === 'applying' ? 'open' : f.status}`)}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {f.proposal && (f.status === 'open' || f.status === 'failed' || (f.status === 'applied' && f.proposal.action === 'forum_restore')) ? (
                        <Button type="button" size="sm" className="min-h-11" disabled={busy === `decide:${f.id}`} onClick={() => void decide(f, 'apply')}>
                          <Check className="mr-1 h-4 w-4" aria-hidden />{td(`agentLoops.action.${f.proposal.action}`, f.proposal.action)}
                        </Button>
                      ) : null}
                      {f.status === 'open' || f.status === 'failed' ? (
                        <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={busy === `decide:${f.id}`} onClick={() => void decide(f, 'dismiss')}>
                          <X className="mr-1 h-4 w-4" aria-hidden />{t('agentLoops.dismiss')}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel className="space-y-3 p-4">
            <h3 className="font-medium text-foreground">{t('agentLoops.runLog')}</h3>
            {!runs.length ? <EmptyState compact title={t('agentLoops.emptyRuns')} description={t('agentLoops.emptyRunsHint')} /> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-2 pr-3 font-medium">{t('agentLoops.col.started')}</th>
                      <th scope="col" className="py-2 pr-3 font-medium">{t('agentLoops.col.trigger')}</th>
                      <th scope="col" className="py-2 pr-3 font-medium">{t('common.status')}</th>
                      <th scope="col" className="py-2 pr-3 font-medium">{t('agentLoops.col.counts')}</th>
                      <th scope="col" className="py-2 font-medium">{t('agentLoops.col.notes')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {runs.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 pr-3 tabular-nums"><time dateTime={r.started_at}>{fmt.dateTime(r.started_at)}</time></td>
                        <td className="py-2 pr-3">{t(`agentLoops.trigger.${r.trigger}`)}</td>
                        <td className={`py-2 pr-3 ${r.status === 'error' ? 'text-destructive' : ''}`}>{td(`agentLoops.runStatus.${r.status}`, r.status)}{r.error ? ` · ${r.error}` : ''}</td>
                        <td className="py-2 pr-3 font-mono text-xs tabular-nums">{Object.entries(r.summary || {}).map(([k, v]) => `${k} ${v}`).join(' · ')}</td>
                        <td className="py-2 font-mono text-xs">{[...(r.notes || []), ...(r.ai?.fallback ? [`ai:${r.ai.fallback}`] : []), ...(r.ai?.calls ? [`ai_calls:${r.ai.calls}`] : [])].join(' · ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </section>
      ) : null}
    </div>
  )
}

function LoopSettingsForm({ loop, busy, weekday, onSave }: { loop: LoopRow; busy: boolean; weekday: (n: number) => string; onSave: (p: Partial<AgentLoopSettings>) => void }) {
  const { t } = useAdminT()
  const [s, setS] = useState<AgentLoopSettings>(loop.settings)
  const set = <K extends keyof AgentLoopSettings>(k: K, v: AgentLoopSettings[K]) => setS((x) => ({ ...x, [k]: v }))
  const id = (k: string) => `loop-${loop.id}-${k}`
  const toggle = (k: 'use_ai' | 'notify' | 'auto_hide' | 'org_admins', label: string) => (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
      <Label htmlFor={id(k)} className="text-sm">{label}</Label>
      <Switch id={id(k)} checked={s[k]} onCheckedChange={(v) => set(k, v)} />
    </div>
  )
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSave(s) }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {loop.usesAi ? toggle('use_ai', t('agentLoops.f.useAi')) : null}
        {loop.messagesPeople ? toggle('notify', t('agentLoops.f.notify')) : null}
        {loop.id === 'community-mod' ? toggle('auto_hide', t('agentLoops.f.autoHide')) : null}
        {loop.id === 'analytics-insight' ? toggle('org_admins', t('agentLoops.f.orgAdmins')) : null}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {loop.usesAi ? (
          <>
            <div className="space-y-1">
              <Label htmlFor={id('cap')}>{t('agentLoops.f.dailyCap')}</Label>
              <Input id={id('cap')} type="number" min={0} max={500} value={s.daily_ai_cap} onChange={(e) => set('daily_ai_cap', Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={id('month')}>{t('agentLoops.f.monthlyCap')}</Label>
              <Input id={id('month')} type="number" min={0} max={200} step="0.5" value={s.monthly_cost_cap_usd} onChange={(e) => set('monthly_cost_cap_usd', Number(e.target.value))} />
            </div>
          </>
        ) : null}
        {loop.cadence !== 'every30' ? (
          <div className="space-y-1">
            <Label htmlFor={id('hour')}>{t('agentLoops.f.hour')}</Label>
            <Input id={id('hour')} type="number" min={0} max={23} value={s.run_hour_utc} onChange={(e) => set('run_hour_utc', Number(e.target.value))} />
          </div>
        ) : null}
        {loop.cadence === 'weekly' ? (
          <div className="space-y-1">
            <Label htmlFor={id('day')}>{t('agentLoops.f.weekday')}</Label>
            <select id={id('day')} value={s.weekday} onChange={(e) => set('weekday', Number(e.target.value))} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {[0, 1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{weekday(d)}</option>)}
            </select>
          </div>
        ) : null}
        <div className="space-y-1">
          <Label htmlFor={id('max')}>{t('agentLoops.f.maxItems')}</Label>
          <Input id={id('max')} type="number" min={1} max={200} value={s.max_items} onChange={(e) => set('max_items', Number(e.target.value))} />
        </div>
      </div>
      {loop.id === 'social-pack' ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">{t('agentLoops.f.langs')}</legend>
          <div className="flex flex-wrap gap-4">
            {CAPTION_LANGS.map((l) => (
              <label key={l} className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={s.langs.includes(l)} onChange={(e) => set('langs', e.target.checked ? [...s.langs, l] : s.langs.filter((x) => x !== l).length ? s.langs.filter((x) => x !== l) : s.langs)} />
                {t(`agentLoops.lang.${l}`)}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <Button type="submit" className="min-h-11" disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}{t('agentLoops.saveSettings')}</Button>
    </form>
  )
}
