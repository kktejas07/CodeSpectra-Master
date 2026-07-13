'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, Trophy, Users, Clock, CalendarDays,
  ArrowRight, ListChecks, Timer, LogIn,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { usePageGuard } from '@/lib/use-page-guard'
import { Countdown } from '@/components/hackathons/countdown'

interface Hackathon {
  id: string; name: string; slug: string; description?: string
  num_teams: number; max_per_team: number; timeout_minutes: number
  starts_at: string; ends_at: string; status: string
  tasks: { problem_slug: string; problem_title: string; points: number; difficulty: string; required: boolean }[]
}

interface Team {
  id: string; name: string; slug: string; qr_token: string; hackathon_id: string
  xp: number; level: number; submissions: number
  members: Array<{ user_id: string; name: string; role: string }>
}

export default function UserHackathonsPage() {
  const gate = usePageGuard('user')
  const { user: authUser } = useAuth()
  const hasSession = authUser?.uid

  const [hackathons, setHackathons] = useState<Hackathon[]>([])
  const [myTeams, setMyTeams] = useState<Record<string, Team>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [hRes, tRes] = await Promise.all([
        fetch('/api/hackathons', { cache: 'no-store' }),
        hasSession ? fetch('/api/hackathons/my-teams', { cache: 'no-store' }).catch(() => null) : Promise.resolve(null),
      ])
      const hData = hRes.ok ? await hRes.json() as { items: Hackathon[] } : { items: [] }
      setHackathons(hData.items || [])

      if (tRes?.ok) {
        const tData = await tRes.json() as { teams: Array<Team & { hackathon_id: string }> }
        const map: Record<string, Team> = {}
        for (const t of tData.teams || []) {
          if (t.members.some((m) => m.user_id === hasSession)) {
            map[t.hackathon_id] = t
          }
        }
        setMyTeams(map)
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [hasSession])

  useEffect(() => {
    if (gate.ready) void load()
  }, [gate.ready, load])

  if (!gate.ready || loading) {
    return <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> Loading hackathons…
    </div>
  }

  const liveHackathons = hackathons.filter((h) => {
    const now = Date.now()
    const starts = new Date(h.starts_at).getTime()
    const ends = new Date(h.ends_at).getTime()
    return h.status !== 'closed' && (now >= starts || h.status === 'live')
  })

  const upcomingHackathons = hackathons.filter((h) => {
    const now = Date.now()
    const starts = new Date(h.starts_at).getTime()
    return h.status !== 'closed' && now < starts
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Trophy className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Hackathons</h1>
          <p className="text-sm text-muted-foreground">Join a team and compete in live coding events.</p>
        </div>
      </div>

      {!hasSession && (
        <Card className="rounded-xl border-primary/20 bg-primary/5 p-4">
          <p className="text-sm">Sign in to join hackathon teams and compete.</p>
          <Link href={`/auth/login?redirect=${encodeURIComponent('/dashboard/hackathons')}`}>
            <Button className="mt-2 gap-1.5" size="sm"><LogIn className="h-3.5 w-3.5" /> Sign in</Button>
          </Link>
        </Card>
      )}

      {liveHackathons.length === 0 && upcomingHackathons.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No hackathons available right now. Check back soon!
        </Card>
      )}

      {liveHackathons.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" /> Live Now
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {liveHackathons.map((hk) => (
              <HackathonCard key={hk.id} hk={hk} myTeam={myTeams[hk.id]} hasSession={!!hasSession} />
            ))}
          </div>
        </section>
      )}

      {upcomingHackathons.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Upcoming
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {upcomingHackathons.map((hk) => (
              <HackathonCard key={hk.id} hk={hk} myTeam={myTeams[hk.id]} hasSession={!!hasSession} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function HackathonCard({ hk, myTeam, hasSession }: { hk: Hackathon; myTeam?: Team; hasSession: boolean }) {
  const starts = new Date(hk.starts_at)
  const ends = new Date(hk.ends_at)
  const now = Date.now()
  const isLive = now >= starts.getTime() && now <= ends.getTime()
  const isClosed = now > ends.getTime() || hk.status === 'closed'

  return (
    <Card className="overflow-hidden rounded-xl border-border/60">
      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/hackathons/${hk.slug}`} className="text-lg font-semibold hover:underline">
            {hk.name}
          </Link>
          <Badge variant={isLive ? 'default' : isClosed ? 'destructive' : 'secondary'} className="uppercase shrink-0">
            {isLive ? 'Live' : isClosed ? 'Closed' : 'Upcoming'}
          </Badge>
        </div>

        {hk.description && <p className="text-xs text-muted-foreground line-clamp-2">{hk.description}</p>}

        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {starts.toLocaleDateString()}</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {hk.timeout_minutes} min</span>
          <span className="flex items-center gap-1"><ListChecks className="h-3 w-3" /> {hk.tasks?.length || 0} problems</span>
          <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {hk.num_teams} teams</span>
          {!isClosed && !isLive && (
            <span className="flex items-center gap-1 text-yellow-500">
              <Timer className="h-3 w-3" /> Starts <Countdown targetIso={hk.starts_at} />
            </span>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Link href={`/hackathons/${hk.slug}`}>
            <Button size="sm" variant="outline">
              View details <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
          {myTeam && (
            <Link href={`/hackathons/${hk.slug}/workspace`}>
              <Button size="sm" className="gap-1">
                <Trophy className="h-3 w-3" /> Enter workspace
              </Button>
            </Link>
          )}
          {hasSession && !myTeam && !isClosed && (
            <Link href={`/hackathons/${hk.slug}`}>
              <Button size="sm" variant="outline">Register</Button>
            </Link>
          )}
        </div>
      </div>
    </Card>
  )
}