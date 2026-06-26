'use client'

/**
 * /hackathons/[slug] — public event registration + leaderboard.
 *
 * Signed-in users can register a team (becomes the captain). Each team
 * receives a unique QR scoreboard URL. The page auto-refreshes the
 * leaderboard every 15s so live events feel real.
 */
import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  Trophy,
  Users,
  Clock,
  CalendarDays,
  ScanLine,
  Sparkles,
  ArrowRight,
} from 'lucide-react'

interface Hackathon {
  id: string
  name: string
  slug: string
  description?: string
  num_teams: number
  max_per_team: number
  timeout_minutes: number
  starts_at: string
  ends_at: string
  status: 'draft' | 'open' | 'live' | 'closed'
}

interface Team {
  id: string
  name: string
  slug: string
  qr_token: string
  xp: number
  level: number
  submissions: number
  members: Array<{ name: string; role: 'captain' | 'member' }>
  achievements: Array<{ id: string; name: string }>
  created_at: string
}

export default function HackathonPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const [hackathon, setHackathon] = useState<Hackathon | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newTeamName, setNewTeamName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newQrSvg, setNewQrSvg] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [hRes, tRes] = await Promise.all([
        fetch(`/api/hackathons/${slug}?by=slug`, { cache: 'no-store' }),
        fetch(`/api/hackathons/${slug}/teams`, { cache: 'no-store' }),
      ])
      if (!hRes.ok) throw new Error('Event not found')
      setHackathon((await hRes.json()) as Hackathon)
      setError(null) // clear any prior error once the event resolves cleanly
      if (tRes.ok) {
        const j = (await tRes.json()) as { items: Team[] }
        setTeams(j.items)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    void load()
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [load])

  async function createTeam() {
    setCreating(true)
    setError(null)
    setNewQrSvg(null)
    try {
      const res = await fetch(`/api/hackathons/${slug}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTeamName || undefined }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'failed')
      setNewTeamName('')
      setNewQrSvg(j.qr_svg as string)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  if (loading && !hackathon) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading event…
      </div>
    )
  }

  if (!hackathon) {
    return (
      <div className="p-10 text-center">
        <p className="text-sm text-destructive">{error || 'Event not found'}</p>
        <Link href="/" className="mt-3 inline-block text-sm text-primary hover:underline">
          ← Home
        </Link>
      </div>
    )
  }

  const ends = new Date(hackathon.ends_at)
  const starts = new Date(hackathon.starts_at)
  const now = Date.now()
  const isLive = now >= starts.getTime() && now <= ends.getTime()
  const isClosed = now > ends.getTime() || hackathon.status === 'closed'

  return (
    <div className="min-h-screen bg-background" data-testid="hackathon-page">
      <header className="border-b border-border bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← CodeSpectra
          </Link>
          <Badge
            variant={isLive ? 'default' : isClosed ? 'destructive' : 'secondary'}
            className="uppercase"
          >
            {isLive ? 'Live' : isClosed ? 'Closed' : 'Open'}
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
        <section>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <Trophy className="h-7 w-7 text-primary" /> {hackathon.name}
          </h1>
          {hackathon.description && (
            <p className="mt-2 text-sm text-muted-foreground">{hackathon.description}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-3 text-xs">
            <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-1">
              <CalendarDays className="h-3 w-3" /> {starts.toLocaleString()}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-1">
              <Clock className="h-3 w-3" /> {hackathon.timeout_minutes} min duration
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-1">
              <Users className="h-3 w-3" /> {teams.length} / {hackathon.num_teams} teams
            </span>
          </div>
        </section>

        {!isClosed && (
          <Card className="space-y-3 p-5" data-testid="hackathon-register-card">
            <h2 className="text-sm font-semibold">Register your team</h2>
            <div className="flex gap-2">
              <Input
                placeholder="Team name (auto-named if blank)"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                data-testid="hackathon-team-name-input"
              />
              <Button
                onClick={createTeam}
                disabled={creating || teams.length >= hackathon.num_teams}
                data-testid="hackathon-register-btn"
              >
                {creating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Register
              </Button>
            </div>
            {teams.length >= hackathon.num_teams && (
              <p className="text-[11px] text-destructive">
                Event is at capacity ({hackathon.num_teams} teams).
              </p>
            )}
            {error && <p className="text-[11px] text-destructive">{error}</p>}
            {newQrSvg && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                <p className="mb-2 text-xs font-semibold text-primary">
                  Welcome aboard! Share this QR with your team.
                </p>
                <div
                  className="mx-auto inline-block rounded-md bg-white p-2"
                  style={{ width: 160 }}
                  dangerouslySetInnerHTML={{ __html: newQrSvg }}
                />
              </div>
            )}
          </Card>
        )}

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Leaderboard ({teams.length})
          </h2>
          {teams.length === 0 ? (
            <Card className="p-6 text-center text-xs text-muted-foreground">
              No teams have registered yet.
            </Card>
          ) : (
            <Card className="divide-y divide-border/60 overflow-hidden">
              {teams.map((t, i) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 p-4"
                  data-testid={`hackathon-team-row-${t.slug}`}
                >
                  <span className="w-8 text-xl font-bold text-muted-foreground tabular-nums">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <p className="font-medium">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t.members.length} member{t.members.length === 1 ? '' : 's'} ·{' '}
                      {t.submissions} submission{t.submissions === 1 ? '' : 's'}
                    </p>
                  </div>
                  {t.achievements.length > 0 && (
                    <Badge variant="outline" className="gap-1">
                      <Sparkles className="h-3 w-3" /> {t.achievements.length}
                    </Badge>
                  )}
                  <Badge className="gap-1">
                    <Trophy className="h-3 w-3" /> {t.xp} XP · Lv {t.level}
                  </Badge>
                  <Link
                    href={`/qr/${t.qr_token}`}
                    target="_blank"
                    className="text-muted-foreground hover:text-foreground"
                    title="Open team QR scoreboard"
                  >
                    <ScanLine className="h-4 w-4" />
                  </Link>
                  <Link
                    href={`/qr/${t.qr_token}`}
                    target="_blank"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              ))}
            </Card>
          )}
        </section>
      </main>
    </div>
  )
}
