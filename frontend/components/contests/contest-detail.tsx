'use client'

/**
 * Contest detail (public): brief, schedule in the contest's time zone, how
 * scoring works, registration (solo / create team / join with code), and the
 * leaderboard (refreshes every 30 s while live).
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Award, CalendarClock, Copy, Loader2, LogIn, Trophy, Users } from 'lucide-react'
import { Panel, Section } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/lib/toast-context'
import { registrationOpen } from '@/lib/contests/config'
import { FORMATS } from '@/lib/contests/formats'
import type { ContestPhase, PublicContestView } from '@/lib/contests/types'
import { FormatIcon, LeaderboardTable, PhaseBadge, fmtWhen, jsonApi, type BoardRow } from './shared'

interface EntryView { id: string; kind: 'user' | 'team'; name: string; members: { name: string; role: string; github_login: string | null; me: boolean }[]; join_code: string | null; is_captain: boolean }
interface Board { rows: BoardRow[]; frozen_at: string | null; final: boolean; hidden_reason: string | null }

export function ContestDetail({ slug, initial }: { slug: string; initial: { contest: PublicContestView; phase: ContestPhase } | null }) {
  const [data, setData] = useState(initial)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (initial) return
    jsonApi<{ contest: PublicContestView; phase: ContestPhase }>(`/api/contests/${encodeURIComponent(slug)}`)
      .then(setData)
      .catch((e) => setLoadError((e as Error).message))
  }, [initial, slug])

  if (loadError) return <div className="mx-auto max-w-xl px-4 py-20"><EmptyState illustration="not-found" title="Contest not found" description="Check the link, or browse open contests." actionLabel="See contests" actionHref="/contests" /></div>
  if (!data) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Loading" /></div>

  const { contest: c, phase } = data
  const meta = FORMATS[c.format]
  const tz = c.schedule.timezone
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-primary"><FormatIcon format={c.format} className="h-4 w-4" /> {meta.label}</span>
          <PhaseBadge phase={phase} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">{c.title}</h1>
        {c.summary && <p className="mt-3 max-w-[70ch] text-lg text-muted-foreground">{c.summary}</p>}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Panel>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Starts</dt><dd className="font-medium text-foreground">{fmtWhen(c.schedule.starts_at, tz)}</dd></div>
              <div><dt className="text-muted-foreground">Ends</dt><dd className="font-medium text-foreground">{fmtWhen(c.schedule.ends_at, tz)}</dd></div>
              <div><dt className="text-muted-foreground">Registration closes</dt><dd className="font-medium text-foreground">{fmtWhen(c.schedule.registration_closes_at || c.schedule.ends_at, tz)}</dd></div>
              <div><dt className="text-muted-foreground">Who can enter</dt><dd className="font-medium text-foreground">{c.participation.mode === 'team' ? `Teams of ${c.participation.team_min}–${c.participation.team_max}` : 'Solo'}</dd></div>
              {c.prize_text && <div className="sm:col-span-2"><dt className="text-muted-foreground">Prizes</dt><dd className="font-medium text-foreground">{c.prize_text}</dd></div>}
            </dl>
          </Panel>

          {c.description && (
            <Section title="About">
              <Panel><p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">{c.description}</p></Panel>
            </Section>
          )}

          <Section title="How it works">
            <Panel className="space-y-3 text-[15px] leading-relaxed">
              <p className="text-foreground">{meta.description}</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Ties go to {c.leaderboard.tie_break === 'fewest_attempts' ? 'the entry with fewer attempts, then whoever got there first' : 'whoever reached the score first'}.</li>
                {c.leaderboard.freeze_minutes > 0 && <li>The public leaderboard freezes for the last {c.leaderboard.freeze_minutes} minutes.</li>}
                {c.leaderboard.visibility !== 'live' && <li>The leaderboard appears {c.leaderboard.visibility === 'after_end' ? 'when the contest ends' : 'when results are released'}.</li>}
                {c.certificates.audience !== 'none' && <li>{c.certificates.audience === 'all' ? 'Everyone who takes part gets a verifiable certificate.' : `The top ${c.certificates.top_n} get a verifiable certificate.`}</li>}
                {meta.judged && c.judging.rubric.length > 0 && <li>Judges score: {c.judging.rubric.map((r) => `${r.name} (${r.weight})`).join(', ')}.</li>}
              </ul>
              {meta.task && c.config.tasks.length > 0 && (
                <p className="text-muted-foreground">{c.config.tasks.length} {c.config.tasks.length === 1 ? meta.task.label.toLowerCase() : meta.task.plural.toLowerCase()}{c.config.hidden_until_start ? ', revealed when the contest starts' : ''}.</p>
              )}
            </Panel>
          </Section>

          <LeaderboardSection slug={c.slug} live={phase === 'live'} unit={c.format === 'datathon' ? String(c.config.metric || 'Score') : 'Score'} />
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <RegisterPanel contest={c} phase={phase} />
        </aside>
      </div>
    </div>
  )
}

function LeaderboardSection({ slug, live, unit }: { slug: string; live: boolean; unit: string }) {
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    jsonApi<Board>(`/api/contests/${encodeURIComponent(slug)}/leaderboard`).then((b) => { setBoard(b); setError(null) }).catch((e) => setError((e as Error).message))
  }, [slug])
  useEffect(() => {
    load()
    if (!live) return
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [load, live])
  return (
    <Section title={board?.final ? 'Final results' : 'Leaderboard'} description={board?.frozen_at ? `Frozen since ${new Date(board.frozen_at).toLocaleTimeString()} — final standings come with the results.` : undefined}>
      <Panel>
        {error ? <p className="text-sm text-destructive">{error} <Button variant="link" className="h-auto p-0" onClick={load}>Retry</Button></p>
          : !board ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Loading leaderboard" /></div>
            : board.hidden_reason ? <p className="py-4 text-center text-sm text-muted-foreground">{board.hidden_reason}</p>
              : <LeaderboardTable rows={board.rows} unit={unit} emptyText="No scores yet — be the first on the board." />}
      </Panel>
    </Section>
  )
}

function RegisterPanel({ contest: c, phase }: { contest: PublicContestView; phase: ContestPhase }) {
  const addToast = useToast()
  const [state, setState] = useState<'loading' | 'signed_out' | 'ready'>('loading')
  const [entry, setEntry] = useState<EntryView | null>(null)
  const [cert, setCert] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [teamName, setTeamName] = useState('')
  const [code, setCode] = useState('')
  const [github, setGithub] = useState('')
  const base = `/api/contests/${encodeURIComponent(c.slug)}`

  const load = useCallback(async () => {
    const res = await fetch(`${base}/entry`, { credentials: 'include', cache: 'no-store' })
    if (res.status === 401) { setState('signed_out'); return }
    const d = await res.json().catch(() => ({}))
    setEntry(d.entry || null)
    setCert(d.certificate_url || null)
    setState('ready')
  }, [base])
  useEffect(() => { void load() }, [load])

  const act = async (body: Record<string, unknown>, okMsg: string) => {
    setBusy(true)
    try {
      await jsonApi(`${base}/entry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      addToast({ type: 'success', title: okMsg })
      await load()
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
    } finally { setBusy(false) }
  }

  const open = registrationOpen(c)
  const started = Date.now() >= Date.parse(c.schedule.starts_at)
  const oss = c.format === 'open_source_sprint'

  return (
    <Panel className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><Users className="h-5 w-5 text-primary" aria-hidden /> Take part</h2>
      {state === 'loading' && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Loading" /></div>}

      {state === 'signed_out' && (
        <>
          <p className="text-sm text-muted-foreground">Sign in to {open ? 'join' : 'see your entry'}.</p>
          <Button asChild className="h-11 w-full rounded-xl"><Link href={`/auth/login?redirect=${encodeURIComponent(`/contests/${c.slug}`)}`}><LogIn className="h-4 w-4" /> Sign in</Link></Button>
        </>
      )}

      {state === 'ready' && entry && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">You’re in{entry.kind === 'team' ? <> as <span className="font-medium text-foreground">{entry.name}</span></> : ''}.</p>
          {entry.kind === 'team' && (
            <ul className="space-y-1 text-sm">
              {entry.members.map((m, i) => <li key={i} className="text-foreground">{m.name}{m.role === 'captain' ? ' · captain' : ''}{m.me ? ' (you)' : ''}</li>)}
            </ul>
          )}
          {entry.join_code && (
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
              <p className="text-muted-foreground">Team code — share it with teammates:</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="font-mono text-base tracking-widest text-foreground">{entry.join_code}</span>
                <Button size="sm" variant="outline" aria-label="Copy team code" onClick={() => { void navigator.clipboard?.writeText(entry.join_code || ''); addToast({ type: 'success', title: 'Code copied' }) }}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
          {oss && (
            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void act({ action: 'github', github_login: github }, 'GitHub username saved') }}>
              <Label htmlFor="gh">Your GitHub username</Label>
              <div className="flex gap-2">
                <Input id="gh" value={github} onChange={(e) => setGithub(e.target.value)} placeholder={entry.members.find((m) => m.me)?.github_login || 'octocat'} autoComplete="off" />
                <Button type="submit" variant="outline" disabled={busy || !github.trim()}>Save</Button>
              </div>
            </form>
          )}
          {phase === 'live' && <Button asChild className="h-11 w-full rounded-xl"><Link href={`/contests/${c.slug}/workspace`}>Open workspace</Link></Button>}
          {!started && <p className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarClock className="h-4 w-4" aria-hidden /> Starts {fmtWhen(c.schedule.starts_at, c.schedule.timezone)}</p>}
          {(phase === 'ended' || phase === 'results') && <Button asChild variant="outline" className="h-11 w-full rounded-xl"><Link href={`/contests/${c.slug}/workspace`}>Your submissions</Link></Button>}
          {cert && <Button asChild variant="outline" className="h-11 w-full rounded-xl"><Link href={cert}><Award className="h-4 w-4" /> View certificate</Link></Button>}
          {!started && <Button variant="ghost" className="w-full text-muted-foreground" disabled={busy} onClick={() => void act({ action: 'leave' }, 'You left the contest')}>Leave</Button>}
        </div>
      )}

      {state === 'ready' && !entry && !open && (
        <p className="text-sm text-muted-foreground">{phase === 'upcoming' ? `Registration opens ${fmtWhen(c.schedule.registration_opens_at, c.schedule.timezone)}.` : phase === 'results' ? 'Results are out.' : 'Registration is closed.'}</p>
      )}

      {state === 'ready' && !entry && open && c.participation.mode === 'solo' && (
        <Button className="h-11 w-full rounded-xl" disabled={busy} onClick={() => void act({ action: 'register' }, 'You’re registered')}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Trophy className="h-4 w-4" />} Join contest
        </Button>
      )}

      {state === 'ready' && !entry && open && c.participation.mode === 'team' && (
        <div className="space-y-5">
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void act({ action: 'register', team_name: teamName }, 'Team created') }}>
            <Label htmlFor="team-name">Start a team</Label>
            <Input id="team-name" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team name" maxLength={60} />
            <Button type="submit" className="h-11 w-full rounded-xl" disabled={busy || teamName.trim().length < 2}>Create team</Button>
          </form>
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void act({ action: 'join', join_code: code }, 'You joined the team') }}>
            <Label htmlFor="team-code">Or join with a team code</Label>
            <Input id="team-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD1234" maxLength={12} autoComplete="off" className="font-mono tracking-widest" />
            <Button type="submit" variant="outline" className="h-11 w-full rounded-xl" disabled={busy || code.trim().length < 6}>Join team</Button>
          </form>
        </div>
      )}
    </Panel>
  )
}
