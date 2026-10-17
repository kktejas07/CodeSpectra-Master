'use client'
import { formatDate } from '@/lib/format-datetime'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Loader2, Trophy, Users, Clock, CalendarDays,
  ArrowRight, Timer, Zap, Code, Target, Gavel,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { usePageGuard } from '@/lib/use-page-guard'
import { SkeletonList, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { isAdmin, type UserRole } from '@/lib/rbac'
import { Countdown } from '@/components/hackathons/countdown'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/app/page-kit'

interface Hackathon {
  id: string; name: string; slug: string; description?: string
  num_teams: number; max_per_team: number; timeout_minutes: number
  starts_at: string; ends_at: string; status: string
  event_type?: string
  tasks: { problem_slug: string; problem_title: string; points: number; difficulty: string; required: boolean }[]
  banner_url?: string
  judges?: string[]
  features?: { team_formation: boolean; demo_video: string; leaderboard_visibility: string }
}

interface Codeathon {
  id: string; title: string; description: string
  difficulty: string; topics: string[]
  startDate: string; endDate: string
  totalPrize: string; prizePool: string
  participants: number; maxParticipants: number
  status: string; registered?: boolean
  problems?: { id: string; title: string; difficulty: string; points: number }[]
}

interface Team {
  id: string; name: string; slug: string; qr_token: string; hackathon_id: string
  xp: number; level: number; submissions: number
  members: Array<{ user_id: string; name: string; role: string }>
}

type EventItem = {
  type: 'hackathon' | 'codeathon'
  id: string
  title: string
  description: string
  status: string
  starts_at: string
  ends_at: string
  participants: number
  max_participants: number
  tasks_count: number
  banner_url?: string
  raw: Hackathon | Codeathon
  myTeam?: Team
  detailHref?: string
}

function EventCard({ event }: { event: EventItem }) {
  const now = Date.now()
  const starts = new Date(event.starts_at).getTime()
  const ends = new Date(event.ends_at).getTime()
  const isLive = now >= starts && now <= ends
  const isClosed = now > ends || event.status === 'closed' || event.status === 'completed'
  const isUpcoming = now < starts

  const statusColor = isLive ? 'bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-400'
    : isClosed ? 'bg-muted text-muted-foreground'
    : 'bg-primary/10 text-primary border-primary/30'

  const statusLabel = isLive ? 'Live' : isClosed ? 'Ended' : 'Upcoming'

  const detailUrl = event.detailHref
    || (event.type === 'hackathon'
      ? `/hackathons/${(event.raw as Hackathon).slug}`
      : `/dashboard/codeathons/${event.id}`)

  return (
    <Card className="group gap-0 overflow-hidden rounded-3xl py-0 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_40px_-20px_rgba(47,91,231,0.35)] motion-reduce:hover:translate-y-0">
      {event.banner_url && (
        <div className="h-32 w-full overflow-hidden bg-muted">
          <img src={event.banner_url} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:group-hover:scale-100" />
        </div>
      )}
      <div className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={`text-[10px] ${statusColor}`}>{statusLabel}</Badge>
              <Badge variant="secondary" className="text-[10px]">
                {event.type === 'hackathon' ? <Trophy className="w-2.5 h-2.5 mr-1" /> : <Code className="w-2.5 h-2.5 mr-1" />}
                {event.type === 'hackathon' ? 'Hackathon' : 'Codeathon'}
              </Badge>
              {event.type === 'hackathon' && event.detailHref && (
                <Badge variant="secondary" className="text-[10px] text-amber-600 border-amber-500/30 bg-amber-500/10">
                  <Gavel className="w-2.5 h-2.5 mr-1" /> Judge
                </Badge>
              )}
            </div>
            <h3 className="truncate text-base font-semibold text-foreground">{event.title}</h3>
            {event.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{event.description}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="w-3 h-3" />
            {formatDate(event.starts_at)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {event.type === 'hackathon'
              ? `${(event.raw as Hackathon).timeout_minutes} min`
              : `${Math.round((new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime()) / 3600000)}h`}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="w-3 h-3" />
            {event.participants} / {event.max_participants}
          </span>
          {event.tasks_count > 0 && (
            <span className="inline-flex items-center gap-1">
              <Target className="w-3 h-3" />
              {event.tasks_count} problems
            </span>
          )}
        </div>

        {isLive && !isClosed && (
          <div className="flex items-center gap-1.5 text-xs font-medium tabular-nums text-green-600 dark:text-green-400">
            <Timer className="w-3 h-3" /> Ends in <Countdown targetIso={event.ends_at} />
          </div>
        )}
        {isUpcoming && (
          <div className="flex items-center gap-1.5 text-xs font-medium tabular-nums text-primary">
            <Timer className="w-3 h-3" /> Starts in <Countdown targetIso={event.starts_at} />
          </div>
        )}

        {event.myTeam && (
          <div className="text-xs text-muted-foreground">
            Team: <span className="font-medium text-foreground">{event.myTeam.name}</span>
            {' '}({event.myTeam.members.length} members)
          </div>
        )}

        <Button size="sm" variant={isLive ? 'default' : 'outline'} className="w-full gap-1.5 text-xs" asChild>
          <Link href={detailUrl}>
            {isLive ? 'Enter event' : isClosed ? 'View results' : 'View details'}
            <ArrowRight className="w-3 h-3" />
          </Link>
        </Button>
      </div>
    </Card>
  )
}

export default function EventsPage() {
  const gate = usePageGuard('user')
  const { user: authUser } = useAuth()
  const hasSession = authUser?.uid
  const { startTour, setTourSeen } = useTour()

  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [tab, setTab] = useState('all')

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const [hRes, cRes, tRes] = await Promise.all([
        fetch('/api/hackathons', { cache: 'no-store' }),
        fetch('/api/codeathons', { cache: 'no-store' }),
        hasSession ? fetch('/api/hackathons/my-teams', { cache: 'no-store' }).catch(() => null) : Promise.resolve(null),
      ])
      if (!hRes.ok && !cRes.ok) throw new Error('Failed to load events')

      const hData = hRes.ok ? await hRes.json() as { items: Hackathon[] } : { items: [] }
      const cData = cRes.ok ? await cRes.json() as { data: Codeathon[] } : { data: [] }

      const myTeamsMap: Record<string, Team> = {}
      if (tRes?.ok) {
        const tData = await tRes.json() as { teams: Array<Team & { hackathon_id: string }> }
        for (const t of tData.teams || []) {
          if (t.members.some((m) => m.user_id === hasSession)) {
            myTeamsMap[t.hackathon_id] = t
          }
        }
      }

      const items: EventItem[] = []

      for (const h of (hData.items || [])) {
        const canReview = isAdmin((gate.user?.role || 'user') as UserRole) || ((h.judges || []).includes(hasSession || ''))
        items.push({
          type: 'hackathon',
          id: h.id,
          title: h.name,
          description: h.description || '',
          status: h.status,
          starts_at: h.starts_at,
          ends_at: h.ends_at,
          participants: 0,
          max_participants: h.num_teams,
          tasks_count: h.tasks?.length || 0,
          banner_url: h.banner_url,
          raw: h,
          myTeam: myTeamsMap[h.id],
          detailHref: canReview ? `/dashboard/events/${h.id}?tab=judge` : undefined,
        })
      }

      for (const c of (cData.data || [])) {
        items.push({
          type: 'codeathon',
          id: c.id,
          title: c.title,
          description: c.description || '',
          status: c.status,
          starts_at: c.startDate,
          ends_at: c.endDate,
          participants: c.participants || 0,
          max_participants: c.maxParticipants || 0,
          tasks_count: c.problems?.length || 0,
          raw: c,
        })
      }

      items.sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
      setEvents(items)
    } catch { setLoadError(true) }
    finally { setLoading(false) }
  }, [hasSession])

  // Initialize tour on first visit
  useEffect(() => {
    if (gate.ready) {
      const eventsTour: TourStep[] = [
        {
          target: '[data-tour="events-header"]',
          title: 'Browse all events',
          description: 'Central hub where participants discover hackathons and codeathons in one list.',
          position: 'bottom',
        },
        {
          target: '[data-tour="events-tabs"]',
          title: 'Filter events fast',
          description: 'Switch tabs to show all, joined, live, upcoming, or past events.',
          position: 'bottom',
        },
        {
          target: '[data-tour="events-grid"]',
          title: 'Tip enter an event',
          description: 'Tip: open a card and press its button to enter, view details, or see results.',
          position: 'bottom',
        },
      ]
      autoPlayPageTour('events', eventsTour)}
  }, [gate.ready, startTour, setTourSeen])

  useEffect(() => {
    if (gate.ready) void load()
  }, [gate.ready, load])

  if (!gate.ready || loading) {
    return (
      <div className="space-y-6 py-10">
        <SkeletonText lines={2} />
        <SkeletonText lines={1} />
        <SkeletonList count={6} />
      </div>
    )
  }

  const now = Date.now()
  const myEvents = events.filter(e => e.myTeam)
  const liveEvents = events.filter(e => {
    const starts = new Date(e.starts_at).getTime()
    const ends = new Date(e.ends_at).getTime()
    return now >= starts && now <= ends
  })
  const upcomingEvents = events.filter(e => now < new Date(e.starts_at).getTime())
  const pastEvents = events.filter(e => now > new Date(e.ends_at).getTime() || e.status === 'closed' || e.status === 'completed')

  const filtered = tab === 'all' ? events
    : tab === 'my' ? myEvents
    : tab === 'live' ? liveEvents
    : tab === 'upcoming' ? upcomingEvents
    : pastEvents

  return (
    <div className="space-y-6">
      <div data-tour="events-header">
        <PageHeader
          illustration="calendar"
          className="mb-0"
          title="Events"
          description="Hackathons, codeathons and coding competitions you can join or follow."
          icon={<Zap />}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab} data-tour="events-tabs">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="all">All ({events.length})</TabsTrigger>
          <TabsTrigger value="my">My Events ({myEvents.length})</TabsTrigger>
          <TabsTrigger value="live">Live ({liveEvents.length})</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming ({upcomingEvents.length})</TabsTrigger>
          <TabsTrigger value="past">Past ({pastEvents.length})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {loadError && events.length === 0 ? (
            <EmptyState
              illustration="error"
              title="Couldn't load events"
              description="Check your connection and try again."
              actionLabel="Try again"
              onAction={() => { setLoading(true); void load() }}
            />
          ) : filtered.length === 0 ? (
            <EmptyState illustration="calendar" 
              title={tab === 'my' ? 'No events joined' : 'No events found'} 
              description={tab === 'my' ? "You haven't joined any events yet. Browse upcoming hackathons and codeathons to take part." : 'Nothing here right now. Check the other tabs or come back later.'}
              actionLabel={tab === 'my' ? 'Explore events' : undefined}
              onAction={tab === 'my' ? () => setTab('all') : undefined}
            />
          ) : (
            <div className="cs-stagger grid gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5" data-tour="events-grid">
              {filtered.map((event) => (
                <EventCard key={`${event.type}-${event.id}`} event={event} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
