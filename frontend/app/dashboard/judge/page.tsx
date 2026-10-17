'use client'
import { formatDate } from '@/lib/format-datetime'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { Countdown } from '@/components/hackathons/countdown'
import {
  Gavel, Trophy, Users, Clock, ArrowRight,
} from 'lucide-react'
import { SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { PageHeader } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { SoftGlow } from '@/components/visuals'

interface Hackathon {
  id: string; name: string; slug: string; description?: string
  num_teams: number; max_per_team: number; timeout_minutes: number
  starts_at: string; ends_at: string; status: string
  judges?: string[]
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', open: 'Registration', live: 'Live', closed: 'Closed',
}

export default function JudgeDashboardPage() {
  // Per-event judges can be any user (assigned on the event's Judges tab), so
  // the page only needs a session; /api/hackathons?judge=1 returns just the
  // events this user judges (empty list otherwise).
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()

  const [hackathons, setHackathons] = useState<(Hackathon & { awaiting: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const res = await fetch('/api/hackathons?judge=1', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed to load judging events (${res.status})`)
      const data = await res.json() as { items: Hackathon[] }

      const withCounts = await Promise.all((data.items || []).map(async (h) => {
        try {
          const s = await fetch(`/api/hackathons/${h.id}/judge-submissions`, { cache: 'no-store' })
          const d = s.ok ? await s.json() as { data: Array<{ status: string }> } : { data: [] }
          return { ...h, awaiting: (d.data || []).filter((x) => x.status === 'submitted').length }
        } catch {
          return { ...h, awaiting: 0 }
        }
      }))

      setHackathons(withCounts.sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()))
    } catch { setLoadError(true) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (gate.ready) void load()
  }, [gate.ready, load])

  // First-visit guided tour (same pattern as the other dashboard pages).
  // Only 2 steps: the page has no stable primary-action button — per-card
  // "Review Submissions" buttons render only when events are assigned.
  useEffect(() => {
    if (gate.ready) {
      const judgeDeskTour: TourStep[] = [
        {
          target: '[data-tour="judge-header"]',
          title: 'Judge desk',
          description: 'All hackathons assigned to you for submission review appear here.',
          position: 'bottom',
        },
        {
          target: '[data-tour="judge-list"]',
          title: 'Review submissions',
          description: 'Open an event to score the submissions awaiting your review.',
          position: 'top',
        },
      ]
      autoPlayPageTour('judge-desk', judgeDeskTour)}
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready || loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="h-7 w-36 bg-muted/60 rounded animate-pulse" />
          <div className="h-4 w-56 bg-muted/40 rounded animate-pulse" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div data-tour="judge-header" className="relative isolate">
        <SoftGlow className="-inset-y-6 [mask-image:radial-gradient(ellipse_at_75%_45%,#000_30%,transparent_72%)]" />
        <PageHeader
          illustration="hackathon"
          className="mb-0"
          title="Judge desk"
          description="Hackathons assigned to you. Open one to score the submissions waiting for review."
          icon={<Gavel />}
        />
      </div>

      <div data-tour="judge-list">
      {loadError && hackathons.length === 0 ? (
        <EmptyState
          illustration="error"
          title="Couldn't load your judging events"
          description="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => { setLoading(true); void load() }}
        />
      ) : hackathons.length === 0 ? (
        <EmptyState illustration="hackathon"
          title="No hackathons assigned to you yet"
          description="An admin adds judges on the event's Judges tab. Events you're assigned to will show up here."
        />
      ) : (
        <div className="cs-stagger grid gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {hackathons.map((h) => {
            const isLive = Date.now() >= new Date(h.starts_at).getTime() && Date.now() <= new Date(h.ends_at).getTime()
            return (
              <Card key={h.id} className="gap-3 rounded-3xl p-5 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_40px_-20px_rgba(47,91,231,0.35)] motion-reduce:hover:translate-y-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      <Trophy className="w-2.5 h-2.5 mr-1" /> Hackathon
                    </Badge>
                    {isLive && <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-400">Live</Badge>}
                    <Badge variant="secondary" className="text-[10px]">{STATUS_LABEL[h.status] || h.status}</Badge>
                  </div>
                </div>
                <h3 className="truncate text-base font-semibold text-foreground">{h.name}</h3>
                {(h.description || '') && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{h.description}</p>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {formatDate(h.starts_at)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="w-3 h-3" /> {h.num_teams} teams
                  </span>
                </div>
                {isLive && (
                  <div className="flex items-center gap-1.5 text-xs font-medium tabular-nums text-green-700 dark:text-green-400">
                    Ends in <Countdown targetIso={h.ends_at} />
                  </div>
                )}
                {h.awaiting > 0 && (
                  <div className="text-xs font-medium tabular-nums text-amber-700 dark:text-amber-400">
                    {h.awaiting} submission{h.awaiting === 1 ? '' : 's'} awaiting review
                  </div>
                )}
                <Button size="sm" className="w-full gap-1.5 text-xs" variant={h.awaiting > 0 ? 'default' : 'outline'} asChild>
                  <Link href={`/dashboard/events/${h.id}?tab=judge`}>
                    Review submissions <ArrowRight className="w-3 h-3" />
                  </Link>
                </Button>
              </Card>
            )
          })}
        </div>
      )}
      </div>
    </div>
  )
}