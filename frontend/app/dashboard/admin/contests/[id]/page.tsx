'use client'

/**
 * Admin → Contests → one contest: details, format settings (tasks, hidden
 * tests, flags, labels, eval sets), judging, leaderboard and results release.
 * Judges (non-staff) see only the judging tab.
 */
import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Loader2, Rocket, Save, ShieldCheck, Trophy, XCircle } from 'lucide-react'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/lib/toast-context'
import { useConfirm } from '@/lib/confirm-context'
import { fromZonedDatetimeString, toZonedDatetimeString } from '@/lib/datetime-local'
import { FORMATS } from '@/lib/contests/formats'
import type { ContestDoc, ContestPhase, ContestRubricCriterion } from '@/lib/contests/types'
import { ConfigEditor } from '@/components/contests/config-editor'
import { JudgingTab } from '@/components/contests/judging'
import { FormatIcon, LeaderboardTable, PhaseBadge, jsonApi, type BoardRow } from '@/components/contests/shared'

interface Loaded { contest: ContestDoc; editor_config: Record<string, unknown> | null; staff: boolean; phase: ContestPhase }
const selectCls = 'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export default function AdminContestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const addToast = useToast()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const base = `/api/contests/${encodeURIComponent(id)}`

  const load = useCallback(async () => {
    try { setData(await jsonApi<Loaded>(`${base}?view=admin`)); setError(null) } catch (e) { setError((e as Error).message) }
  }, [base])
  useEffect(() => { void load() }, [load])

  const run = async (key: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(key)
    try { await fn(); addToast({ type: 'success', title: okMsg }); await load() } catch (e) { addToast({ type: 'error', title: (e as Error).message }) } finally { setBusy(null) }
  }

  if (error) return <div className="mx-auto max-w-xl p-6"><EmptyState illustration="not-found" title="Contest not found" description={error} actionLabel="Back to contests" actionHref="/dashboard/admin/contests" /></div>
  if (!data) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Loading" /></div>

  const c = data.contest
  const meta = FORMATS[c.format]
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <Link href="/dashboard/admin/contests" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden /> All contests</Link>
      <PageHeader
        title={c.title}
        description={<span className="inline-flex flex-wrap items-center gap-2"><FormatIcon format={c.format} className="h-4 w-4 text-primary" /> {meta.label} <PhaseBadge phase={data.phase} /></span>}
        actions={data.staff ? (
          <>
            <Button asChild variant="outline" className="h-10 rounded-xl"><Link href={`/contests/${c.slug}`} target="_blank"><ExternalLink className="h-4 w-4" /> Public page</Link></Button>
            <Button asChild variant="outline" className="h-10 rounded-xl"><Link href={`/dashboard/admin/contests/${encodeURIComponent(c.id)}/integrity`}><ShieldCheck className="h-4 w-4" aria-hidden /> Integrity</Link></Button>
            {c.status === 'draft' && <Button className="h-10 rounded-xl" disabled={!!busy || c.config_errors.length > 0} onClick={() => void run('publish', () => jsonApi(base, json('POST', { action: 'publish' })), 'Published')}>{busy === 'publish' ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Rocket className="h-4 w-4" />} Publish</Button>}
            {c.status === 'published' && !c.results_released && <Button variant="outline" className="h-10 rounded-xl" disabled={!!busy} onClick={() => void run('unpublish', () => jsonApi(base, json('POST', { action: 'unpublish' })), 'Back to draft')}>Unpublish</Button>}
          </>
        ) : undefined}
      />
      {data.staff && c.config_errors.length > 0 && (
        <Panel className="border-amber-500/40 text-sm">
          <p className="font-medium text-foreground">Before you can publish:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">{c.config_errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}</ul>
        </Panel>
      )}
      <Tabs defaultValue={data.staff ? 'details' : 'judging'} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          {data.staff && <TabsTrigger value="details">Details</TabsTrigger>}
          {data.staff && <TabsTrigger value="format">{meta.task ? meta.task.plural : 'Format settings'}</TabsTrigger>}
          {meta.judged && <TabsTrigger value="judging">Judging</TabsTrigger>}
          {data.staff && <TabsTrigger value="results">Leaderboard and results</TabsTrigger>}
        </TabsList>
        {data.staff && <TabsContent value="details"><DetailsTab c={c} base={base} onSaved={load} /></TabsContent>}
        {data.staff && <TabsContent value="format"><FormatTab c={c} initial={data.editor_config || {}} base={base} onSaved={load} /></TabsContent>}
        {meta.judged && <TabsContent value="judging"><JudgingTab base={base} released={c.results_released} /></TabsContent>}
        {data.staff && <TabsContent value="results"><ResultsTab c={c} base={base} onDone={load} /></TabsContent>}
      </Tabs>
    </div>
  )
}

function DetailsTab({ c, base, onSaved }: { c: ContestDoc; base: string; onSaved: () => Promise<void> }) {
  const addToast = useToast()
  const tz = c.schedule.timezone || 'UTC'
  const local = (iso: string | null) => (iso ? toZonedDatetimeString(new Date(iso), tz) : '')
  const [f, setF] = useState({
    title: c.title, summary: c.summary, description: c.description, visibility: c.visibility, prize_text: c.prize_text, banner_url: c.banner_url,
    timezone: tz, starts_at: local(c.schedule.starts_at), ends_at: local(c.schedule.ends_at),
    registration_opens_at: local(c.schedule.registration_opens_at), registration_closes_at: local(c.schedule.registration_closes_at),
    mode: c.participation.mode, team_min: c.participation.team_min, team_max: c.participation.team_max, max_entries: c.participation.max_entries,
    lb_visibility: c.leaderboard.visibility, freeze_minutes: c.leaderboard.freeze_minutes, tie_break: c.leaderboard.tie_break,
    cert_audience: c.certificates.audience, cert_top_n: c.certificates.top_n,
    judges: c.judging.judges.join(', '), drop_high_low: c.judging.drop_high_low,
  })
  const [rubric, setRubric] = useState<ContestRubricCriterion[]>(c.judging.rubric)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f, v: unknown) => setF((x) => ({ ...x, [k]: v }))
  const zone = (v: string, z: string) => (v ? fromZonedDatetimeString(v, z) : null)

  const save = async () => {
    setBusy(true)
    try {
      const z = f.timezone || 'UTC'
      await jsonApi(base, json('PATCH', {
        title: f.title, summary: f.summary, description: f.description, visibility: f.visibility, prize_text: f.prize_text, banner_url: f.banner_url,
        schedule: { timezone: z, starts_at: zone(f.starts_at, z), ends_at: zone(f.ends_at, z), registration_opens_at: zone(f.registration_opens_at, z), registration_closes_at: zone(f.registration_closes_at, z) },
        participation: { mode: f.mode, team_min: Number(f.team_min), team_max: Number(f.team_max), max_entries: Number(f.max_entries) },
        leaderboard: { visibility: f.lb_visibility, freeze_minutes: Number(f.freeze_minutes), tie_break: f.tie_break },
        certificates: { audience: f.cert_audience, top_n: Number(f.cert_top_n) },
        judging: { rubric, judges: f.judges.split(/[\s,]+/).filter(Boolean), drop_high_low: f.drop_high_low },
      }))
      addToast({ type: 'success', title: 'Saved' })
      await onSaved()
    } catch (e) { addToast({ type: 'error', title: (e as Error).message }) } finally { setBusy(false) }
  }
  const judged = FORMATS[c.format].judged
  const sum = rubric.reduce((a, r) => a + (Number(r.weight) || 0), 0)
  return (
    <div className="space-y-6">
      <Panel className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="d-title">Title</Label><Input id="d-title" value={f.title} maxLength={120} onChange={(e) => set('title', e.target.value)} /></div>
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="d-summary">One-line summary</Label><Input id="d-summary" value={f.summary} maxLength={240} onChange={(e) => set('summary', e.target.value)} /></div>
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="d-desc">Description and rules</Label><Textarea id="d-desc" rows={6} value={f.description} onChange={(e) => set('description', e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="d-vis">Visibility</Label><select id="d-vis" className={selectCls} value={f.visibility} onChange={(e) => set('visibility', e.target.value)}><option value="public">Public (listed, in the events feed)</option><option value="unlisted">Unlisted (link only)</option></select></div>
        <div className="space-y-1"><Label htmlFor="d-prize">Prizes</Label><Input id="d-prize" value={f.prize_text} maxLength={200} onChange={(e) => set('prize_text', e.target.value)} placeholder="Certificates for the top 3" /></div>
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="d-banner">Banner image link (https)</Label><Input id="d-banner" value={f.banner_url} onChange={(e) => set('banner_url', e.target.value)} /></div>
      </Panel>
      <Panel className="grid gap-4 sm:grid-cols-2">
        <h3 className="font-semibold text-foreground sm:col-span-2">Schedule</h3>
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="d-tz">Time zone (IANA, e.g. Asia/Kolkata)</Label><Input id="d-tz" value={f.timezone} onChange={(e) => set('timezone', e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="d-start">Starts</Label><Input id="d-start" type="datetime-local" value={f.starts_at} onChange={(e) => set('starts_at', e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="d-end">Ends</Label><Input id="d-end" type="datetime-local" value={f.ends_at} onChange={(e) => set('ends_at', e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="d-ro">Registration opens (optional)</Label><Input id="d-ro" type="datetime-local" value={f.registration_opens_at} onChange={(e) => set('registration_opens_at', e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="d-rc">Registration closes (optional)</Label><Input id="d-rc" type="datetime-local" value={f.registration_closes_at} onChange={(e) => set('registration_closes_at', e.target.value)} /></div>
      </Panel>
      <Panel className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <h3 className="font-semibold text-foreground sm:col-span-2 lg:col-span-4">Entries, leaderboard and certificates</h3>
        <div className="space-y-1"><Label htmlFor="d-mode">Who enters</Label><select id="d-mode" className={selectCls} value={f.mode} disabled={c.status !== 'draft'} onChange={(e) => set('mode', e.target.value)}><option value="solo">Solo</option><option value="team">Teams</option></select></div>
        <div className="space-y-1"><Label htmlFor="d-tmin">Team size from</Label><Input id="d-tmin" type="number" min={1} max={20} value={f.team_min} disabled={f.mode !== 'team'} onChange={(e) => set('team_min', e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="d-tmax">Team size up to</Label><Input id="d-tmax" type="number" min={1} max={20} value={f.team_max} disabled={f.mode !== 'team'} onChange={(e) => set('team_max', e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="d-cap">Most entries (0 = no limit)</Label><Input id="d-cap" type="number" min={0} value={f.max_entries} onChange={(e) => set('max_entries', e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="d-lb">Leaderboard</Label><select id="d-lb" className={selectCls} value={f.lb_visibility} onChange={(e) => set('lb_visibility', e.target.value)}><option value="live">Live</option><option value="after_end">After the end</option><option value="hidden">Only with results</option></select></div>
        <div className="space-y-1"><Label htmlFor="d-freeze">Freeze last N minutes</Label><Input id="d-freeze" type="number" min={0} value={f.freeze_minutes} onChange={(e) => set('freeze_minutes', e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="d-tie">Tie-break</Label><select id="d-tie" className={selectCls} value={f.tie_break} onChange={(e) => set('tie_break', e.target.value)}><option value="earliest">First to reach the score</option><option value="fewest_attempts">Fewest attempts</option></select></div>
        <div className="space-y-1"><Label htmlFor="d-cert">Certificates</Label><select id="d-cert" className={selectCls} value={f.cert_audience} onChange={(e) => set('cert_audience', e.target.value)}><option value="all">Everyone who took part</option><option value="top_n">Top N only</option><option value="none">None</option></select></div>
        {f.cert_audience !== 'none' && <div className="space-y-1"><Label htmlFor="d-topn">Rank wording for the top</Label><Input id="d-topn" type="number" min={1} max={100} value={f.cert_top_n} onChange={(e) => set('cert_top_n', e.target.value)} /></div>}
      </Panel>
      {judged && (
        <Panel className="space-y-4">
          <h3 className="font-semibold text-foreground">Rubric and judges</h3>
          {rubric.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_96px_auto] items-end gap-2">
              <div className="space-y-1"><Label htmlFor={`rb-${i}`}>Criterion</Label><Input id={`rb-${i}`} value={r.name} onChange={(e) => setRubric(rubric.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></div>
              <div className="space-y-1"><Label htmlFor={`rw-${i}`}>Points</Label><Input id={`rw-${i}`} type="number" min={1} max={100} value={r.weight} onChange={(e) => setRubric(rubric.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))} /></div>
              <Button type="button" variant="ghost" aria-label={`Remove ${r.name}`} onClick={() => setRubric(rubric.filter((_, j) => j !== i))}><XCircle className="h-4 w-4" /></Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            {rubric.length < 12 && <Button type="button" variant="outline" size="sm" onClick={() => setRubric([...rubric, { name: '', weight: 10 }])}>Add criterion</Button>}
            <span className={sum === 100 ? 'text-sm text-muted-foreground' : 'text-sm text-amber-700 dark:text-amber-400'}>Total {sum} / 100</span>
          </div>
          <div className="space-y-1"><Label htmlFor="d-judges">Judge user ids (comma separated)</Label><Input id="d-judges" value={f.judges} onChange={(e) => set('judges', e.target.value)} /><p className="text-xs text-muted-foreground">Company admins can add members of their organisation. Judges get an in-app notice and email.</p></div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"><Label htmlFor="d-dhl">Drop each entry’s highest and lowest judge score</Label><Switch id="d-dhl" checked={f.drop_high_low} onCheckedChange={(v) => set('drop_high_low', v)} /></div>
        </Panel>
      )}
      <Button className="h-11 rounded-xl" onClick={() => void save()} disabled={busy || c.results_released}>{busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Save className="h-4 w-4" />} Save details</Button>
    </div>
  )
}

function FormatTab({ c, initial, base, onSaved }: { c: ContestDoc; initial: Record<string, unknown>; base: string; onSaved: () => Promise<void> }) {
  const addToast = useToast()
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await jsonApi(base, json('PATCH', { config: value }))
      addToast({ type: 'success', title: 'Saved' })
      await onSaved()
    } catch (e) { addToast({ type: 'error', title: (e as Error).message }) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-4">
      {c.status !== 'draft' && <Panel className="text-sm text-muted-foreground">This contest is published. Changes apply to new submissions only; earlier scores are not recalculated.</Panel>}
      <ConfigEditor format={c.format} value={value} onChange={setValue} />
      <Button className="h-11 rounded-xl" onClick={() => void save()} disabled={busy || c.results_released}>{busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Save className="h-4 w-4" />} Save settings</Button>
    </div>
  )
}

function ResultsTab({ c, base, onDone }: { c: ContestDoc; base: string; onDone: () => Promise<void> }) {
  const addToast = useToast()
  const confirm = useConfirm()
  const [board, setBoard] = useState<{ rows: BoardRow[] } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { jsonApi<{ rows: BoardRow[] }>(`${base}/leaderboard`).then(setBoard).catch(() => setBoard({ rows: [] })) }, [base])
  const release = async () => {
    setBusy(true)
    try {
      const p = await jsonApi<{ reasons: string[]; entries: number; ranked: number; pending_review: number }>(base, json('POST', { action: 'preview_release' }))
      const ok = await confirm({
        title: 'Release results?',
        description: [`${p.ranked} of ${p.entries} entries are ranked. Everyone is notified and certificates are issued. This cannot be undone.`, ...p.reasons].join(' '),
        confirmText: 'Release results',
      })
      if (!ok) return
      const r = await jsonApi<{ notified: number; certificates_issued: number }>(base, json('POST', { action: 'release', force: true }))
      addToast({ type: 'success', title: `Released — ${r.notified} notified, ${r.certificates_issued} certificates` })
      await onDone()
    } catch (e) { addToast({ type: 'error', title: (e as Error).message }) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-4">
      <Panel>
        <h3 className="mb-3 font-semibold text-foreground">{c.results_released ? 'Final results' : 'Live standings (staff view, never frozen)'}</h3>
        {!board ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Loading" /></div> : <LeaderboardTable rows={board.rows} unit={c.format === 'datathon' ? String(c.config.metric || 'Score') : 'Score'} />}
      </Panel>
      {!c.results_released && c.status !== 'draft' && (
        <Button className="h-11 rounded-xl" disabled={busy} onClick={() => void release()}>{busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Trophy className="h-4 w-4" />} Release results</Button>
      )}
      {c.results_released && <p className="text-sm text-muted-foreground">Results were released {c.released_at ? new Date(c.released_at).toLocaleString() : ''}.</p>}
    </div>
  )
}
