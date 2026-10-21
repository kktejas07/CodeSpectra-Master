'use client'

/** My league: teams for open seasons (create / join with a code / leave) and season badges. */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Award, Copy, Shield, Users } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { PageHeader, Panel, Section } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { Field, errorOf, fieldClass, fmtDate } from '@/components/campus/shared'

interface MyLeague {
  teams: Array<{ id: string; season_id: string; name: string; college_id: string | null; members: Array<{ name: string; you: boolean; captain: boolean }> }>
  badges: Array<{ id: string; label: string; rank: number; awarded_at: string; badge: string }>
  seasons: Array<{ id: string; slug: string; name: string; starts_at: string; ends_at: string; status: string; team: { min_size: number; max_size: number } | null }>
}

export default function MyLeaguesPage() {
  const gate = usePageGuard('user')
  const addToast = useToast()
  const [data, setData] = useState<MyLeague | null>(null)
  const [error, setError] = useState(false)
  const [reload, setReload] = useState(0)
  const [code, setCode] = useState<string | null>(null)

  useEffect(() => {
    if (!gate.ready) return
    let live = true
    fetch('/api/leagues/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (live) setData(d) })
      .catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [gate.ready, reload])
  const refresh = useCallback(() => setReload((n) => n + 1), [])

  if (!gate.ready || (!data && !error)) return <div className="w-full space-y-6" aria-busy="true"><SkeletonText lines={2} /><SkeletonList count={3} /></div>
  if (error || !data) return <EmptyState illustration="error" title="We couldn't load your league" description="Try again in a moment." actionLabel="Try again" onAction={refresh} />

  const now = Date.now()
  const open = data.seasons.filter((s) => s.status === 'published' && Date.parse(s.ends_at) > now)
  const post = async (body: Record<string, unknown>) => {
    const r = await csrfFetch('/api/leagues/teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!r.ok) { addToast({ type: 'error', title: await errorOf(r) }); return null }
    return r.json()
  }

  return (
    <div className="w-full space-y-8">
      <PageHeader
        icon={<Shield aria-hidden />}
        title="Leagues"
        description="Seasons across contests, codeathons, hackathons and the arena. Your college and your team climb the table with you."
        actions={<Button asChild variant="outline" size="sm"><Link href="/leagues">League tables</Link></Button>}
      />

      {code && (
        <Panel className="border-primary/30 bg-primary/5" role="status">
          <p className="font-semibold text-foreground">Team created — share this join code with your teammates</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="rounded-lg bg-card px-3 py-2 font-mono text-lg tracking-widest text-foreground">{code}</code>
            <Button variant="ghost" size="icon" aria-label="Copy join code" onClick={() => { void navigator.clipboard?.writeText(code); addToast({ type: 'success', title: 'Copied' }) }}><Copy className="h-4 w-4" aria-hidden /></Button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">It's shown only once. If you lose it, the team can still play — create a new team to get a new code.</p>
        </Panel>
      )}

      <Section title="My teams">
        {data.teams.length === 0 ? (
          <EmptyState compact illustration="team" title="You're not in a team yet" description={open.length ? 'Create a team for the current season or join one with a code.' : 'Teams open when the next season starts.'} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {data.teams.map((t) => {
              const season = data.seasons.find((s) => s.id === t.season_id)
              return (
                <Panel key={t.id} className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div><p className="text-sm text-muted-foreground">{season?.name ?? 'Season'}</p><h3 className="font-semibold text-foreground">{t.name}</h3></div>
                    <Users className="h-5 w-5 text-primary" aria-hidden />
                  </div>
                  <ul className="flex flex-wrap gap-2 text-sm">{t.members.map((m, i) => <li key={i} className="rounded-full bg-muted px-2.5 py-0.5 text-foreground">{m.name}{m.you ? ' (you)' : ''}{m.captain ? ' · captain' : ''}</li>)}</ul>
                  {season && season.status === 'published' && Date.parse(season.ends_at) > now && (
                    <Button variant="ghost" size="sm" onClick={async () => {
                      const r = await csrfFetch(`/api/leagues/teams?team=${encodeURIComponent(t.id)}`, { method: 'DELETE' })
                      if (!r.ok) addToast({ type: 'error', title: await errorOf(r) })
                      refresh()
                    }}>Leave team</Button>
                  )}
                </Panel>
              )
            })}
          </div>
        )}
      </Section>

      {open.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <CreateTeam seasons={open} onCreate={async (season_id, name) => { const d = await post({ action: 'create', season_id, name }); if (d) { setCode(d.join_code); refresh() } }} existing={data.teams.map((t) => t.season_id)} />
          <Panel>
            <h2 className="text-lg font-semibold text-foreground">Join a team</h2>
            <JoinTeam onJoin={async (c) => { const d = await post({ action: 'join', code: c }); if (d) { addToast({ type: 'success', title: `You joined ${d.team.name}` }); refresh() } }} />
          </Panel>
        </div>
      )}

      <Section title="Badges">
        {data.badges.length === 0 ? <EmptyState compact illustration="certificate" title="No badges yet" description="Top finishers get a badge when a season is finalised." /> : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.badges.map((b) => (
              <li key={b.id}><Panel className="flex items-center gap-3 p-4"><Award className="h-6 w-6 shrink-0 text-primary" aria-hidden /><div><p className="font-medium text-foreground">{b.label}</p><p className="text-xs text-muted-foreground">Rank {b.rank} · {fmtDate(b.awarded_at)}</p></div></Panel></li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function CreateTeam({ seasons, existing, onCreate }: { seasons: MyLeague['seasons']; existing: string[]; onCreate: (seasonId: string, name: string) => Promise<void> }) {
  const choices = seasons.filter((s) => !existing.includes(s.id))
  const [season, setSeason] = useState(choices[0]?.id ?? '')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Panel>
      <h2 className="text-lg font-semibold text-foreground">Create a team</h2>
      {choices.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">You already have a team for every open season.</p> : (
        <form className="mt-3 space-y-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await onCreate(season, name); setName('') } finally { setBusy(false) } }}>
          {choices.length > 1 && (
            <Field id="t-season" label="Season">
              <select id="t-season" className={fieldClass} value={season} onChange={(e) => setSeason(e.target.value)}>{choices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </Field>
          )}
          <Field id="t-name" label="Team name" hint={`Teams of ${choices[0]?.team?.min_size ?? 2}–${choices[0]?.team?.max_size ?? 5}. Points: the best member result per event.`}>
            <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={40} />
          </Field>
          <Button type="submit" disabled={busy || name.trim().length < 3} className="min-h-11">Create team</Button>
        </form>
      )}
    </Panel>
  )
}

function JoinTeam({ onJoin }: { onJoin: (code: string) => Promise<void> }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form className="mt-3 space-y-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await onJoin(code.trim()); setCode('') } finally { setBusy(false) } }}>
      <Field id="t-code" label="Join code"><Input id="t-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required maxLength={10} className="font-mono tracking-widest" autoComplete="off" /></Field>
      <Button type="submit" disabled={busy || code.trim().length !== 10} className="min-h-11">Join team</Button>
    </form>
  )
}
