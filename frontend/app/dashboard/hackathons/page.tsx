'use client'
import { formatDate } from '@/lib/format-datetime'

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
import { SkeletonList, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { isSuperAdmin } from '@/lib/rbac'
import { Countdown } from '@/components/hackathons/countdown'
import { AppBanner, BannerChip, bannerBtnPrimary, bannerBtnSecondary } from '@/components/visuals'
import { EmptyState } from '@/components/ui/empty-state'

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
  const { startTour, setTourSeen } = useTour()

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

  // Initialize tour on first visit
  useEffect(() => {
    if (gate.ready) {
      const hackathonsTour: TourStep[] = [
        {
          target: '[data-tour="hackathons-header"]',
          title: 'Join team hackathons',
          description: 'Team coding events page where participants join teams and compete live.',
          position: 'bottom',
        },
        {
          target: '[data-tour="hackathons-live"]',
          title: 'Enter live workspaces',
          description: 'Enter a live workspace, register your team, or view details.',
          position: 'bottom',
        },
        {
          target: '[data-tour="hackathons-upcoming"]',
          title: 'Tip: register early',
          description: 'Tip: open an upcoming card to register before it goes live.',
          position: 'bottom',
        },
      ]
      autoPlayPageTour('hackathons', hackathonsTour)}
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready || loading) {
    return (
      <div className="space-y-6 py-10">
        <SkeletonText lines={2} />
        <SkeletonList count={4} />
      </div>
    )
  }

  const now = Date.now()

  const liveHackathons = hackathons.filter((h) => {
    if (h.status === 'closed') return false
    const starts = new Date(h.starts_at).getTime()
    const ends = new Date(h.ends_at).getTime()
    return now >= starts && now <= ends
  })

  const upcomingHackathons = hackathons.filter((h) => {
    if (h.status === 'closed') return false
    const starts = new Date(h.starts_at).getTime()
    return now < starts
  })

  const closedHackathons = hackathons.filter((h) => {
    return h.status === 'closed' || new Date(h.ends_at).getTime() < now
  })

  return (
    <div className="space-y-6">
      <div data-tour="hackathons-header">
        <AppBanner
          eyebrow="Hackathons"
          title="Build with a team, compete live"
          description="Join a team, solve the event's problems before the clock runs out and climb the event leaderboard."
          actions={
            hasSession ? (
              <>
                <Link href="/dashboard/events" className={bannerBtnPrimary}>
                  <CalendarDays className="h-4 w-4" aria-hidden /> My events
                </Link>
                <Link href="/dashboard/codeathons" className={bannerBtnSecondary}>
                  Codeathons <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </>
            ) : (
              <Link href={`/auth/login?redirect=${encodeURIComponent('/dashboard/hackathons')}`} className={bannerBtnPrimary}>
                <LogIn className="h-4 w-4" aria-hidden /> Sign in to join a team
              </Link>
            )
          }
          art={
            <div className="flex flex-col items-end gap-3">
              <BannerChip icon={<Trophy />} label={`${liveHackathons.length} live now`} sub="Open for teams" />
              <BannerChip icon={<Timer />} label={`${upcomingHackathons.length} upcoming`} sub="Register early" className="mr-8" delay="0.6s" />
            </div>
          }
        />
      </div>

      {liveHackathons.length === 0 && upcomingHackathons.length === 0 && (
        <EmptyState illustration="hackathon"
          title="No hackathons open right now"
          description="New events will appear here as soon as they're announced. Meanwhile, keep practising problems."
          actionLabel="Practise problems"
          actionHref="/dashboard/problems"
        />
      )}

      {liveHackathons.length > 0 && (
        <section data-tour="hackathons-live">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
            <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse motion-reduce:animate-none" aria-hidden /> Live now
          </h2>
          <div className="cs-stagger grid gap-4 md:grid-cols-2 lg:gap-5">
            {liveHackathons.map((hk) => (
              <HackathonCard key={hk.id} hk={hk} myTeam={myTeams[hk.id]} hasSession={!!hasSession} isSuperAdmin={isSuperAdmin(gate.user?.role ?? 'user')} />
            ))}
          </div>
        </section>
      )}

      {upcomingHackathons.length > 0 && (
        <section data-tour="hackathons-upcoming">
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            Upcoming
          </h2>
          <div className="cs-stagger grid gap-4 md:grid-cols-2 lg:gap-5">
            {upcomingHackathons.map((hk) => (
              <HackathonCard key={hk.id} hk={hk} myTeam={myTeams[hk.id]} hasSession={!!hasSession} isSuperAdmin={isSuperAdmin(gate.user?.role ?? 'user')} />
            ))}
          </div>
        </section>
      )}

      {closedHackathons.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            Closed events
          </h2>
          <div className="cs-stagger grid gap-4 md:grid-cols-2 lg:gap-5">
            {closedHackathons.slice(0, 6).map((hk) => (
              <HackathonCard key={hk.id} hk={hk} myTeam={myTeams[hk.id]} hasSession={!!hasSession} isSuperAdmin={isSuperAdmin(gate.user?.role ?? 'user')} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function HackathonCard({ hk, myTeam, hasSession, isSuperAdmin }: { hk: Hackathon; myTeam?: Team; hasSession: boolean; isSuperAdmin: boolean }) {
  const starts = new Date(hk.starts_at)
  const ends = new Date(hk.ends_at)
  const now = Date.now()
  const isLive = now >= starts.getTime() && now <= ends.getTime()
  const isClosed = now > ends.getTime() || hk.status === 'closed'
  const locked = isClosed && !isSuperAdmin

  return (
    <Card className="gap-0 overflow-hidden rounded-3xl py-0 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_40px_-20px_rgba(47,91,231,0.35)] motion-reduce:hover:translate-y-0">
      <div className="space-y-3 p-6">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/hackathons/${hk.slug}`} className="rounded text-lg font-semibold text-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">
            {hk.name}
          </Link>
          <Badge variant={isLive ? 'default' : isClosed ? 'outline' : 'secondary'} className="shrink-0">
            {isLive ? 'Live' : isClosed ? 'Closed' : 'Upcoming'}
          </Badge>
        </div>

        {hk.description && <p className="text-xs text-muted-foreground line-clamp-2">{hk.description}</p>}

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-muted-foreground">
          <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {formatDate(starts)}</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {hk.timeout_minutes} min</span>
          <span className="flex items-center gap-1"><ListChecks className="h-3 w-3" /> {hk.tasks?.length || 0} problems</span>
          <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {hk.num_teams} teams</span>
          {!isClosed && !isLive && (
            <span className="flex items-center gap-1 font-medium text-primary">
              <Timer className="h-3 w-3" /> Starts <Countdown targetIso={hk.starts_at} />
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {locked ? (
            <Button size="sm" variant="outline" disabled>
              View details <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          ) : (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/hackathons/${hk.slug}`}>
                View details <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          )}
          {myTeam && (
            locked ? (
              <Button size="sm" className="gap-1" disabled>
                <Trophy className="h-3 w-3" /> Enter workspace
              </Button>
            ) : (
              <Button size="sm" className="gap-1" asChild>
                <Link href={`/hackathons/${hk.slug}/workspace`}>
                  <Trophy className="h-3 w-3" /> Enter workspace
                </Link>
              </Button>
            )
          )}
          {hasSession && !myTeam && !isClosed && (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/hackathons/${hk.slug}`}>Register</Link>
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}