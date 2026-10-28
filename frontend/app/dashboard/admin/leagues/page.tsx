'use client'

/** Superadmin: league seasons — window, scoring config, live preview of the boards, finalise (freeze + badges). */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Shield } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { seasonPhase, type SeasonConfig, type SeasonDoc } from '@/lib/leagues/types'
import { PageHeader, Panel, Section } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { Field, StatusPill, errorOf, fmtDate } from '@/components/campus/shared'

interface ListResponse { items: SeasonDoc[]; suggested: { name: string; slug: string; starts_at: string; ends_at: string }; defaults: SeasonConfig }
interface Boards { computed_at: string; events: number; colleges: Array<{ rank: number; name: string; points: number }>; teams: Array<{ rank: number; name: string; points: number }>; individual: Array<{ rank: number; name: string; points: number }> }

const day = (iso: string) => iso.slice(0, 10)

export default function AdminLeaguesPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [data, setData] = useState<ListResponse | null>(null)
  const [error, setError] = useState(false)
  const [reload, setReload] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (!gate.ready) return
    let live = true
    fetch('/api/admin/leagues', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (live) { setData(d); setSelected((s) => s ?? d.items?.[0]?.id ?? null) } })
      .catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [gate.ready, reload])
  const refresh = useCallback(() => setReload((n) => n + 1), [])

  if (!gate.ready || (!data && !error)) return <div className="w-full space-y-6" aria-busy="true"><SkeletonText lines={2} /><SkeletonList count={3} /></div>
  if (error || !data) return <EmptyState illustration="error" title="We couldn't load seasons" description="Try again in a moment." actionLabel="Try again" onAction={refresh} />

  const create = async () => {
    const r = await csrfFetch('/api/admin/leagues', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: data.suggested.name, slug: data.suggested.slug, starts_at: data.suggested.starts_at, ends_at: data.suggested.ends_at }) })
    if (!r.ok) { addToast({ type: 'error', title: await errorOf(r) }); return }
    const d = await r.json()
    addToast({ type: 'success', title: `${d.season.name} created as a draft` })
    setSelected(d.season.id)
    refresh()
  }

  const season = data.items.find((s) => s.id === selected) ?? null
  return (
    <div className="w-full space-y-6">
      <PageHeader
        icon={<Shield aria-hidden />}
        title="Leagues"
        description="Quarterly seasons across contests, codeathons, hackathons and the arena, with college and team tables."
        actions={<><Button asChild variant="outline" size="sm"><Link href="/leagues">Public page</Link></Button><Button size="sm" onClick={create}>New season ({data.suggested.name})</Button></>}
      />
      {data.items.length === 0 ? (
        <EmptyState illustration="leaderboard" title="No seasons yet" description="Create the current quarter's season, check the scoring, then publish it." actionLabel={`Create ${data.suggested.name}`} onAction={create} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <nav aria-label="Seasons" className="space-y-2">
            {data.items.map((s) => (
              <button key={s.id} type="button" onClick={() => setSelected(s.id)} aria-current={s.id === selected ? 'true' : undefined}
                className={`w-full rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${s.id === selected ? 'border-primary bg-primary/5' : 'border-border/70 bg-card hover:border-primary/40'}`}>
                <p className="font-medium text-foreground">{s.name}</p>
                <p className="text-xs text-muted-foreground">{fmtDate(s.starts_at)} – {fmtDate(s.ends_at)}</p>
                <span className="mt-1 inline-block"><StatusPill status={seasonPhase(s)} /></span>
              </button>
            ))}
          </nav>
          {season && <SeasonEditor key={season.id} season={season} onChange={refresh} />}
        </div>
      )}
    </div>
  )
}

function SeasonEditor({ season, onChange }: { season: SeasonDoc; onChange: () => void }) {
  const addToast = useToast()
  const frozen = season.status === 'finalized'
  const c = season.config
  const [f, setF] = useState({
    name: season.name, starts: day(season.starts_at), ends: day(season.ends_at),
    placement: c.placement_points.join(', '), beyondMax: String(c.beyond_top_max), beyondMin: String(c.beyond_top_min), participation: String(c.participation_points),
    easy: String(c.difficulty_multipliers.easy), medium: String(c.difficulty_multipliers.medium), hard: String(c.difficulty_multipliers.hard),
    halfLife: String(c.decay.half_life_days), floor: String(c.decay.floor), minRanked: String(c.min_ranked_entries),
    arenaPer: String(c.arena.points_per_solve), arenaMax: String(c.arena.max_per_season), topK: String(c.college_top_k),
    teamMin: String(c.team.min_size), teamMax: String(c.team.max_size), bInd: String(c.badges.individual_top_n), bCol: String(c.badges.college_top_n), bTeam: String(c.badges.team_top_n),
    sources: { ...c.sources }, overrides: Object.entries(c.event_difficulty).map(([k, v]) => `${k}=${v}`).join('\n'),
  })
  const [boards, setBoards] = useState<Boards | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    fetch(`/api/admin/leagues/${season.id}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (live) setBoards(d.boards) })
      .catch(() => { if (live) setBoards(null) })
    return () => { live = false }
  }, [season.id, season.updated_at])

  const config = (): SeasonConfig => ({
    placement_points: f.placement.split(/[\s,]+/).filter(Boolean).map(Number),
    beyond_top_max: Number(f.beyondMax), beyond_top_min: Number(f.beyondMin), participation_points: Number(f.participation),
    difficulty_multipliers: { easy: Number(f.easy), medium: Number(f.medium), hard: Number(f.hard) },
    decay: { half_life_days: Number(f.halfLife), floor: Number(f.floor) }, min_ranked_entries: Number(f.minRanked),
    arena: { points_per_solve: Number(f.arenaPer), max_per_season: Number(f.arenaMax) }, college_top_k: Number(f.topK),
    sources: f.sources, team: { min_size: Number(f.teamMin), max_size: Number(f.teamMax) },
    badges: { individual_top_n: Number(f.bInd), college_top_n: Number(f.bCol), team_top_n: Number(f.bTeam) },
    // The server validates keys and values; a typo comes back as a clear error.
    event_difficulty: Object.fromEntries(f.overrides.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.split('=').map((x) => x.trim()) as [string, string])) as SeasonConfig['event_difficulty'],
  })

  const save = async (status?: 'draft' | 'published') => {
    setBusy(true)
    try {
      const body = { name: f.name, starts_at: new Date(`${f.starts}T00:00:00Z`).toISOString(), ends_at: new Date(`${f.ends}T23:59:59Z`).toISOString(), config: config(), ...(status ? { status } : {}) }
      const r = await csrfFetch(`/api/admin/leagues/${season.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) { addToast({ type: 'error', title: await errorOf(r) }); return }
      addToast({ type: 'success', title: status === 'published' ? 'Season published' : 'Saved' })
      onChange()
    } finally { setBusy(false) }
  }
  const action = async (a: 'recompute' | 'finalize') => {
    if (a === 'finalize' && !window.confirm('Finalise this season? The tables freeze and badges are awarded. This cannot be undone.')) return
    setBusy(true)
    try {
      const r = await csrfFetch(`/api/admin/leagues/${season.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: a }) })
      if (!r.ok) { addToast({ type: 'error', title: await errorOf(r) }); return }
      const d = await r.json()
      addToast({ type: 'success', title: a === 'finalize' ? `Season finalised — ${d.badges} badges awarded` : 'Public tables refreshed' })
      onChange()
    } finally { setBusy(false) }
  }

  const num = (k: keyof typeof f, label: string, step = '1') => (
    <Field id={`c-${String(k)}`} label={label}><Input id={`c-${String(k)}`} type="number" step={step} value={f[k] as string} onChange={(e) => setF({ ...f, [k]: e.target.value })} disabled={frozen} /></Field>
  )

  return (
    <div className="space-y-6">
      <Panel className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="s-name" label="Name"><Input id="s-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} disabled={frozen} /></Field>
          <Field id="s-start" label="Starts"><Input id="s-start" type="date" value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} disabled={frozen} /></Field>
          <Field id="s-end" label="Ends"><Input id="s-end" type="date" value={f.ends} onChange={(e) => setF({ ...f, ends: e.target.value })} disabled={frozen} /></Field>
        </div>
        <fieldset className="grid gap-4 sm:grid-cols-3" disabled={frozen}>
          <legend className="mb-2 text-sm font-semibold text-foreground sm:col-span-3">Scoring</legend>
          <Field id="c-placement" label="Points for places 1, 2, 3…" className="sm:col-span-3"><Input id="c-placement" value={f.placement} onChange={(e) => setF({ ...f, placement: e.target.value })} /></Field>
          {num('beyondMax', 'Next place after the table')}{num('beyondMin', 'Last place')}{num('participation', 'Participation')}
          {num('easy', 'Easy ×', '0.05')}{num('medium', 'Medium ×', '0.05')}{num('hard', 'Hard ×', '0.05')}
          {num('halfLife', 'Decay half-life (days, 0 = off)')}{num('floor', 'Decay floor (0–1)', '0.05')}{num('minRanked', 'Minimum ranked entries')}
          {num('arenaPer', 'Arena points per solve', '0.5')}{num('arenaMax', 'Arena cap per season')}{num('topK', 'College counts its best')}
          {num('teamMin', 'Team minimum')}{num('teamMax', 'Team maximum')}{num('bInd', 'Individual badges (top N)')}
          {num('bCol', 'College badges (top N)')}{num('bTeam', 'Team badges (top N)')}
          <div className="flex flex-wrap gap-3 sm:col-span-3">
            {(['contest', 'codeathon', 'hackathon', 'arena'] as const).map((k) => (
              <label key={k} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-3 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={f.sources[k]} onChange={(e) => setF({ ...f, sources: { ...f.sources, [k]: e.target.checked } })} />{k.charAt(0).toUpperCase() + k.slice(1)}s count
              </label>
            ))}
          </div>
          <Field id="c-over" label="Difficulty overrides" hint="One per line: contest:<id>=hard, codeathon:<id>=easy" className="sm:col-span-3">
            <textarea id="c-over" className="min-h-20 w-full rounded-lg border border-input bg-transparent p-3 font-mono text-xs text-foreground dark:bg-input/30" value={f.overrides} onChange={(e) => setF({ ...f, overrides: e.target.value })} />
          </Field>
        </fieldset>
        {!frozen && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save()} disabled={busy} className="min-h-11">Save</Button>
            {season.status === 'draft' && <Button variant="outline" onClick={() => save('published')} disabled={busy} className="min-h-11">Publish season</Button>}
            {season.status === 'published' && <Button variant="outline" onClick={() => action('recompute')} disabled={busy} className="min-h-11">Refresh public tables</Button>}
            {season.status === 'published' && Date.parse(season.ends_at) < Date.now() && <Button variant="destructive" onClick={() => action('finalize')} disabled={busy} className="min-h-11">Finalise and award badges</Button>}
          </div>
        )}
        {frozen && <p className="text-sm text-muted-foreground">Finalised {fmtDate(season.finalized_at)} — tables and badges are frozen.</p>}
      </Panel>

      <Section title="Preview" description={boards ? `${boards.events} events · computed ${new Date(boards.computed_at).toLocaleString()}` : 'Computing…'}>
        {!boards ? <SkeletonList count={3} /> : (
          <div className="grid gap-4 lg:grid-cols-3">
            {([['Colleges', boards.colleges], ['Teams', boards.teams], ['Individuals', boards.individual]] as const).map(([title, rows]) => (
              <Panel key={title} className="p-5">
                <h3 className="font-semibold text-foreground">{title}</h3>
                {rows.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No points yet.</p> : (
                  <ol className="mt-2 space-y-1 text-sm">{rows.slice(0, 10).map((r, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate text-foreground"><span className="tabular-nums text-muted-foreground">{r.rank}.</span> {r.name}</span><span className="tabular-nums text-muted-foreground">{r.points}</span></li>)}</ol>
                )}
              </Panel>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
