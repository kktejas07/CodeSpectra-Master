'use client'

/**
 * Admin → Daily digest (superadmin). The digest runs by itself (08:00 IST by
 * default, auto-publish on); here the owner sees status and history, runs it
 * now or previews it without publishing, tunes ranking weights, category
 * quotas, N, publish time and AI caps, and edits the templates per language.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Eye, ExternalLink, Loader2, Newspaper, Play, Save } from 'lucide-react'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useAdminT } from '@/lib/i18n/admin'
import type { DigestSettings, RankWeights } from '@/lib/digest/settings'
import { renderDigest, type DigestTemplates } from '@/lib/digest/templates'
import { DIGEST_CATEGORIES, DIGEST_GROUPS, DIGEST_LOCALES, type DigestDoc, type DigestLocale, type DigestRunDoc, type TraceStep } from '@/lib/digest/types'

interface ListRow { date: string; status: DigestDoc['status']; count: number; published_at: string | null; mode: DigestDoc['mode'] }
interface Overview {
  settings: DigestSettings
  templates: DigestTemplates
  raw_templates: Partial<Record<DigestLocale, Partial<DigestTemplates['en']>>>
  ai: { blocked: string | null; callsToday: number; spentUsd: number } | null
  today: string
  has_today: boolean
  next_run: { date: string; time: string; timezone: string }
  digests: ListRow[]
  runs: (Omit<DigestRunDoc, 'trace'> & { trace_count: number })[]
  last_trace: TraceStep[]
}

const WEIGHT_KEYS: (keyof RankWeights)[] = ['freshness', 'deadline', 'prize', 'trust', 'relevance', 'engagement', 'language']
const selectCls = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export default function AdminDigestPage() {
  const { t, td, fmt } = useAdminT()
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [tab, setTab] = useState('overview')
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState<'' | 'run' | 'preview' | 'save' | string>('')
  const [preview, setPreview] = useState<{ digest: DigestDoc | null; message: string } | null>(null)
  const [form, setForm] = useState<DigestSettings | null>(null)
  const [lang, setLang] = useState<DigestLocale>('en')
  const [tpl, setTpl] = useState<Partial<Record<DigestLocale, Partial<DigestTemplates['en']>>>>({})

  const load = useCallback(async () => {
    setError(false)
    try {
      const r = await fetch('/api/admin/digest', { cache: 'no-store' })
      const d = await r.json().catch(() => null)
      if (!r.ok || !d) throw new Error('load')
      setData(d)
      setForm(d.settings)
      setTpl(d.raw_templates || {})
    } catch {
      setError(true)
    }
  }, [])

  useEffect(() => { if (gate.allowed) void load() }, [gate.allowed, load])

  const post = async (body: Record<string, unknown>) => {
    const r = await csrfFetch('/api/admin/digest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => null)
    if (!r.ok || !d) throw new Error('post')
    return d
  }

  const run = async (kind: 'run' | 'preview') => {
    setBusy(kind)
    try {
      const d = await post({ action: kind })
      if (kind === 'preview') { setPreview({ digest: d.digest, message: d.message }); setTab('preview') }
      addToast({ type: d.ok ? 'success' : 'error', title: d.message || t('digest.done') })
      void load()
    } catch {
      addToast({ type: 'error', title: t('digest.err.run') })
    } finally {
      setBusy('')
    }
  }

  const setStatus = async (date: string, action: 'publish' | 'unpublish') => {
    setBusy(`${action}:${date}`)
    try {
      await post({ action, date })
      addToast({ type: 'success', title: action === 'publish' ? t('digest.published') : t('digest.unpublished') })
      void load()
    } catch {
      addToast({ type: 'error', title: t('digest.err.save') })
    } finally {
      setBusy('')
    }
  }

  const saveSettings = async () => {
    if (!form) return
    setBusy('save')
    try {
      const { enabled, n, quotas, max_per_category, max_per_source, weights, timezone, publish_time, auto_publish, bootstrap, repeat_days, max_age_days, check_links, ai_enabled, daily_ai_cap, monthly_cost_cap_usd, notify_subscribers } = form
      await post({ action: 'settings', patch: { enabled, n, quotas, max_per_category, max_per_source, weights, timezone, publish_time, auto_publish, bootstrap, repeat_days, max_age_days, check_links, ai_enabled, daily_ai_cap, monthly_cost_cap_usd, notify_subscribers } })
      addToast({ type: 'success', title: t('digest.saved') })
      void load()
    } catch {
      addToast({ type: 'error', title: t('digest.err.save') })
    } finally {
      setBusy('')
    }
  }

  const saveTemplates = async () => {
    setBusy('save')
    try {
      const cur = tpl[lang] || {}
      await post({ action: 'templates', patch: { [lang]: { heading: cur.heading ?? '', intro: cur.intro ?? '', outro: cur.outro ?? '', sections: cur.sections ?? {} } } })
      addToast({ type: 'success', title: t('digest.saved') })
      void load()
    } catch {
      addToast({ type: 'error', title: t('digest.err.save') })
    } finally {
      setBusy('')
    }
  }

  if (gate.loading) return <SkeletonList count={6} />
  if (!gate.allowed) return null

  const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Number(v) || 0))
  const today = data?.digests.find((d) => d.date === data.today)
  const statusLabel = (s: string) => td(`digest.status.${s}`, s)
  const lastRun = data?.runs[0]

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Newspaper />}
        title={t('digest.title')}
        description={t('digest.description')}
        actions={
          <>
            <Button variant="outline" onClick={() => run('preview')} disabled={!!busy}>
              {busy === 'preview' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Eye className="mr-2 h-4 w-4" aria-hidden />}{t('digest.preview')}
            </Button>
            <Button onClick={() => run('run')} disabled={!!busy}>
              {busy === 'run' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Play className="mr-2 h-4 w-4" aria-hidden />}{t('digest.runNow')}
            </Button>
          </>
        }
      />

      {error && <Panel className="p-4 text-sm text-destructive" role="alert">{t('digest.err.load')} <Button variant="link" onClick={() => void load()}>{t('digest.retry')}</Button></Panel>}
      {!data && !error && <SkeletonList count={4} />}

      {data && form && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t('digest.today')} value={today ? statusLabel(today.status) : t('digest.notYet')} hint={today ? t('digest.items', { count: today.count }) : data.today} />
            <StatCard label={t('digest.nextRun')} value={`${data.next_run.time}`} hint={`${data.next_run.date} · ${data.next_run.timezone}`} />
            <StatCard label={t('digest.aiToday')} value={`${data.ai?.callsToday ?? 0} / ${form.daily_ai_cap}`} hint={data.ai?.blocked ? td(`digest.block.${data.ai.blocked}`, data.ai.blocked) : t('digest.aiOk')} />
            <StatCard label={t('digest.spend')} value={`$${(data.ai?.spentUsd ?? 0).toFixed(2)}`} hint={t('digest.capOf', { cap: `$${form.monthly_cost_cap_usd}` })} />
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex-wrap">
              <TabsTrigger value="overview">{t('digest.tab.overview')}</TabsTrigger>
              <TabsTrigger value="preview">{t('digest.tab.preview')}</TabsTrigger>
              <TabsTrigger value="settings">{t('digest.tab.settings')}</TabsTrigger>
              <TabsTrigger value="templates">{t('digest.tab.templates')}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <Panel className="p-5">
                <h2 className="mb-3 text-lg font-semibold text-foreground">{t('digest.history')}</h2>
                {data.digests.length === 0 ? (
                  <EmptyState compact title={t('digest.emptyTitle')} description={t('digest.emptyBody')} />
                ) : (
                  <ul className="divide-y divide-border">
                    {data.digests.map((d) => (
                      <li key={d.date} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground">{d.date}</span>
                          <Badge variant={d.status === 'published' ? 'default' : 'outline'}>{statusLabel(d.status)}</Badge>
                          <span className="text-sm text-muted-foreground">{t('digest.items', { count: d.count })} · {td(`digest.mode.${d.mode}`, d.mode)}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {d.status === 'published' && (
                            <Button asChild variant="outline" size="sm"><Link href={`/digest/${d.date}`} target="_blank">{t('digest.view')} <ExternalLink className="ml-1 h-3 w-3" aria-hidden /></Link></Button>
                          )}
                          {d.status !== 'published' ? (
                            <Button size="sm" onClick={() => setStatus(d.date, 'publish')} disabled={!!busy}>{t('digest.publish')}</Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => setStatus(d.date, 'unpublish')} disabled={!!busy}>{t('digest.unpublish')}</Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel className="p-5">
                <h2 className="mb-3 text-lg font-semibold text-foreground">{t('digest.runs')}</h2>
                {data.runs.length === 0 ? <p className="text-sm text-muted-foreground">{t('digest.noRuns')}</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="text-left text-muted-foreground">
                        <tr><th className="py-2 pr-3 font-medium">{t('digest.col.started')}</th><th className="py-2 pr-3 font-medium">{t('digest.col.trigger')}</th><th className="py-2 pr-3 font-medium">{t('common.status')}</th><th className="py-2 pr-3 font-medium">{t('digest.col.verified')}</th><th className="py-2 pr-3 font-medium">{t('digest.col.rejected')}</th><th className="py-2 font-medium">{t('digest.col.message')}</th></tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {data.runs.map((r) => (
                          <tr key={r.id}>
                            <td className="py-2 pr-3 whitespace-nowrap">{fmt.dateTime(r.started_at)}</td>
                            <td className="py-2 pr-3">{td(`digest.trigger.${r.trigger}`, r.trigger)}</td>
                            <td className="py-2 pr-3"><Badge variant={r.status === 'failed' ? 'destructive' : 'outline'}>{td(`digest.run.${r.status}`, r.status)}</Badge></td>
                            <td className="py-2 pr-3 tabular-nums">{r.verified} / {r.selected}</td>
                            <td className="py-2 pr-3 tabular-nums">{r.rejected?.length ?? 0}</td>
                            <td className="py-2 text-muted-foreground">{r.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              {lastRun && data.last_trace.length > 0 && (
                <Panel className="p-5">
                  <h2 className="mb-1 text-lg font-semibold text-foreground">{t('digest.trace')}</h2>
                  <p className="mb-3 text-sm text-muted-foreground">{t('digest.traceBody')}</p>
                  <ol className="max-h-96 space-y-1 overflow-y-auto text-sm">
                    {data.last_trace.map((s, i) => (
                      <li key={i} className="flex gap-2">
                        <Badge variant="outline" className="shrink-0">{td(`digest.agent.${s.agent}`, s.agent)}</Badge>
                        <span className="shrink-0 font-medium text-foreground">{s.tool}</span>
                        <span className="min-w-0 break-words text-muted-foreground">{s.note}</span>
                      </li>
                    ))}
                  </ol>
                </Panel>
              )}
            </TabsContent>

            <TabsContent value="preview">
              {!preview ? (
                <EmptyState compact title={t('digest.previewEmpty')} description={t('digest.previewEmptyBody')} actionLabel={t('digest.preview')} onAction={() => run('preview')} />
              ) : !preview.digest ? (
                <Panel className="p-5 text-sm text-muted-foreground">{preview.message}</Panel>
              ) : (
                <Panel className="space-y-5 p-5">
                  <p className="text-sm text-muted-foreground">{preview.message}</p>
                  {renderDigest(preview.digest, 'en', data.templates).sections.map((s) => (
                    <section key={s.category} className="space-y-2">
                      <h3 className="font-semibold text-foreground">{s.heading} <span className="text-muted-foreground">({s.items.length})</span></h3>
                      <ul className="space-y-2">
                        {s.items.map((i) => {
                          const full = preview.digest!.items.find((x) => x.key === i.key)
                          return (
                            <li key={i.key} className="rounded-2xl border border-border p-3">
                              <p className="font-medium text-foreground">{i.rank}. {i.title}</p>
                              <p className="text-sm text-muted-foreground">{i.summary}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{t('digest.score', { score: (full?.score ?? 0).toFixed(3) })} · {i.source_name} · {i.summary_ai ? t('digest.aiSummary') : t('digest.templateSummary')}</p>
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  ))}
                </Panel>
              )}
            </TabsContent>

            <TabsContent value="settings">
              <Panel className="space-y-6 p-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {([['enabled', 'digest.f.enabled'], ['auto_publish', 'digest.f.autoPublish'], ['bootstrap', 'digest.f.bootstrap'], ['ai_enabled', 'digest.f.aiEnabled'], ['check_links', 'digest.f.checkLinks'], ['notify_subscribers', 'digest.f.notify']] as const).map(([k, label]) => (
                    <label key={k} className="flex items-center justify-between gap-3 rounded-2xl border border-border p-3 text-sm text-foreground">
                      <span>{t(label)}</span>
                      <Switch checked={form[k]} onCheckedChange={(v) => setForm({ ...form, [k]: v })} aria-label={t(label)} />
                    </label>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1"><Label htmlFor="dg-n">{t('digest.f.n')}</Label><Input id="dg-n" type="number" min={1} max={60} value={form.n} onChange={(e) => setForm({ ...form, n: num(e.target.value, 1, 60) })} /></div>
                  <div className="space-y-1"><Label htmlFor="dg-time">{t('digest.f.time')}</Label><Input id="dg-time" type="time" value={form.publish_time} onChange={(e) => setForm({ ...form, publish_time: e.target.value })} /></div>
                  <div className="space-y-1"><Label htmlFor="dg-tz">{t('digest.f.timezone')}</Label><Input id="dg-tz" value={form.timezone} maxLength={64} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></div>
                  <div className="space-y-1"><Label htmlFor="dg-rep">{t('digest.f.repeatDays')}</Label><Input id="dg-rep" type="number" min={0} max={30} value={form.repeat_days} onChange={(e) => setForm({ ...form, repeat_days: num(e.target.value, 0, 30) })} /></div>
                  <div className="space-y-1"><Label htmlFor="dg-age">{t('digest.f.maxAge')}</Label><Input id="dg-age" type="number" min={1} max={60} value={form.max_age_days} onChange={(e) => setForm({ ...form, max_age_days: num(e.target.value, 1, 60) })} /></div>
                  <div className="space-y-1"><Label htmlFor="dg-cat">{t('digest.f.maxPerCategory')}</Label><Input id="dg-cat" type="number" min={1} max={60} value={form.max_per_category} onChange={(e) => setForm({ ...form, max_per_category: num(e.target.value, 1, 60) })} /></div>
                  <div className="space-y-1"><Label htmlFor="dg-src">{t('digest.f.maxPerSource')}</Label><Input id="dg-src" type="number" min={1} max={60} value={form.max_per_source} onChange={(e) => setForm({ ...form, max_per_source: num(e.target.value, 1, 60) })} /></div>
                  <div className="space-y-1"><Label htmlFor="dg-cap">{t('digest.f.dailyAiCap')}</Label><Input id="dg-cap" type="number" min={0} max={200} value={form.daily_ai_cap} onChange={(e) => setForm({ ...form, daily_ai_cap: num(e.target.value, 0, 200) })} /></div>
                  <div className="space-y-1"><Label htmlFor="dg-usd">{t('digest.f.monthlyCap')}</Label><Input id="dg-usd" type="number" min={0} max={500} step="0.5" value={form.monthly_cost_cap_usd} onChange={(e) => setForm({ ...form, monthly_cost_cap_usd: Math.max(0, Math.min(500, Number(e.target.value) || 0)) })} /></div>
                </div>
                <fieldset className="space-y-3">
                  <legend className="text-sm font-semibold text-foreground">{t('digest.f.quotas')}</legend>
                  <p className="text-sm text-muted-foreground">{t('digest.f.quotasBody')}</p>
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    {DIGEST_GROUPS.map((g) => (
                      <div key={g} className="space-y-1"><Label htmlFor={`dg-q-${g}`}>{td(`digest.group.${g}`, g)}</Label><Input id={`dg-q-${g}`} type="number" min={0} max={50} value={form.quotas[g]} onChange={(e) => setForm({ ...form, quotas: { ...form.quotas, [g]: num(e.target.value, 0, 50) } })} /></div>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="space-y-3">
                  <legend className="text-sm font-semibold text-foreground">{t('digest.f.weights')}</legend>
                  <p className="text-sm text-muted-foreground">{t('digest.f.weightsBody')}</p>
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    {WEIGHT_KEYS.map((k) => (
                      <div key={k} className="space-y-1"><Label htmlFor={`dg-w-${k}`}>{td(`digest.weight.${k}`, k)}</Label><Input id={`dg-w-${k}`} type="number" min={0} max={5} step="0.1" value={form.weights[k]} onChange={(e) => setForm({ ...form, weights: { ...form.weights, [k]: Math.max(0, Math.min(5, Number(e.target.value) || 0)) } })} /></div>
                    ))}
                  </div>
                </fieldset>
                <div className="flex justify-end">
                  <Button onClick={saveSettings} disabled={!!busy}>{busy === 'save' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Save className="mr-2 h-4 w-4" aria-hidden />}{t('common.save')}</Button>
                </div>
              </Panel>
            </TabsContent>

            <TabsContent value="templates">
              <Panel className="space-y-4 p-5">
                <p className="text-sm text-muted-foreground">{t('digest.tplBody')}</p>
                <div className="max-w-xs space-y-1">
                  <Label htmlFor="dg-lang">{t('digest.tplLang')}</Label>
                  <select id="dg-lang" value={lang} onChange={(e) => setLang(e.target.value as DigestLocale)} className={selectCls}>
                    {DIGEST_LOCALES.map((l) => <option key={l} value={l}>{td(`digest.lang.${l}`, l)}</option>)}
                  </select>
                </div>
                {(['heading', 'intro', 'outro'] as const).map((k) => (
                  <div key={k} className="space-y-1">
                    <Label htmlFor={`dg-t-${k}`}>{td(`digest.tpl.${k}`, k)}</Label>
                    {k === 'heading' ? (
                      <Input id={`dg-t-${k}`} maxLength={120} value={tpl[lang]?.[k] ?? ''} placeholder={data.templates[lang][k]} onChange={(e) => setTpl({ ...tpl, [lang]: { ...(tpl[lang] || {}), [k]: e.target.value } })} />
                    ) : (
                      <Textarea id={`dg-t-${k}`} maxLength={600} rows={3} value={tpl[lang]?.[k] ?? ''} placeholder={data.templates[lang][k]} onChange={(e) => setTpl({ ...tpl, [lang]: { ...(tpl[lang] || {}), [k]: e.target.value } })} />
                    )}
                  </div>
                ))}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {DIGEST_CATEGORIES.map((c) => (
                    <div key={c} className="space-y-1">
                      <Label htmlFor={`dg-s-${c}`}>{td(`digest.category.${c}`, c)}</Label>
                      <Input id={`dg-s-${c}`} maxLength={80} value={tpl[lang]?.sections?.[c] ?? ''} placeholder={data.templates[lang].sections[c]}
                        onChange={(e) => setTpl({ ...tpl, [lang]: { ...(tpl[lang] || {}), sections: { ...(tpl[lang]?.sections || {}), [c]: e.target.value } as DigestTemplates['en']['sections'] } })} />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button onClick={saveTemplates} disabled={!!busy}>{busy === 'save' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Save className="mr-2 h-4 w-4" aria-hidden />}{t('common.save')}</Button>
                </div>
              </Panel>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}
