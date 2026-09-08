'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { Countdown } from '@/components/hackathons/countdown'
import {
  Gavel, Trophy, Users, Clock, ArrowRight, Inbox,
} from 'lucide-react'
import { SkeletonCard } from '@/components/ui/skeleton-boneyard'

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
  const gate = usePageGuard('judge')
  const { startTour, setTourSeen } = useTour()

  const [hackathons, setHackathons] = useState<(Hackathon & { awaiting: number })[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/hackathons?judge=1', { cache: 'no-store' })
      if (!res.ok) return
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
    } catch { /* ignore */ }
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
          title: 'Judge Desk',
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
      <div data-tour="judge-header">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Gavel className="h-6 w-6 text-primary" /> Judge Desk
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Hackathons assigned to you for submission review
        </p>
      </div>

      <div data-tour="judge-list">
      {hackathons.length === 0 ? (
        <Card className="p-10 flex flex-col items-center justify-center text-center gap-3">
          <Inbox className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No hackathons assigned to you yet. An admin assigns judges on the event's Judges tab.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {hackathons.map((h) => {
            const isLive = Date.now() >= new Date(h.starts_at).getTime() && Date.now() <= new Date(h.ends_at).getTime()
            return (
              <Card key={h.id} className="p-4 space-y-3 hover:border-primary/40 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      <Trophy className="w-2.5 h-2.5 mr-1" /> Hackathon
                    </Badge>
                    {isLive && <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">Live</Badge>}
                    <Badge variant="secondary" className="text-[10px]">{STATUS_LABEL[h.status] || h.status}</Badge>
                  </div>
                </div>
                <h3 className="font-semibold text-sm truncate">{h.name}</h3>
                {(h.description || '') && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{h.description}</p>
                )}
                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {new Date(h.starts_at).toLocaleDateString()}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="w-3 h-3" /> {h.num_teams} teams
                  </span>
                </div>
                {isLive && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                    Ends in <Countdown targetIso={h.ends_at} />
                  </div>
                )}
                {h.awaiting > 0 && (
                  <div className="text-xs font-medium text-amber-600">
                    {h.awaiting} submission{h.awaiting === 1 ? '' : 's'} awaiting review
                  </div>
                )}
                <Link href={`/dashboard/events/${h.id}?tab=judge`}>
                  <Button size="sm" className="w-full gap-1.5 text-xs" variant={h.awaiting > 0 ? 'default' : 'outline'}>
                    Review Submissions <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </Card>
            )
          })}
        </div>
      )}
      </div>
    </div>
  )
}