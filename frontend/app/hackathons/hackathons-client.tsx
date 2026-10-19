'use client'
import { formatDate as tzFormatDate } from '@/lib/format-datetime'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Users, Clock, CalendarDays, ArrowRight, ListChecks } from 'lucide-react'
import { PageHero, btnPrimary, btnSecondary } from '@/components/landing/page-hero'
import { DeviceShowcase } from '@/components/visuals'
import { EmptyState } from '@/components/ui/empty-state'

export interface Hackathon {
  id: string; name: string; slug: string; description?: string
  num_teams: number; max_per_team: number; timeout_minutes: number
  starts_at: string; ends_at: string; status: string
  tasks: { problem_slug: string; problem_title: string; points: number; difficulty: string; required: boolean }[]
}

function formatDate(iso: string) {
  if (!iso) return 'TBA'
  return tzFormatDate(iso, undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'active' || status === 'live') return <Badge className="border-green-500/30 bg-green-500/15 text-green-700 dark:text-green-400">Live</Badge>
  if (status === 'upcoming' || status === 'open') return <Badge className="border-cs-accent/30 bg-cs-accent/10 text-cs-accent-text">Upcoming</Badge>
  return <Badge variant="outline" className="text-muted-foreground">Ended</Badge>
}

/** Listing; the server page passes the public events so they are in the HTML (fetches only as a fallback). */
export function HackathonsList({ initial }: { initial: Hackathon[] | null }) {
  const [hackathons, setHackathons] = useState<Hackathon[]>(initial ?? [])
  const [loading, setLoading] = useState(initial === null)

  useEffect(() => {
    if (initial !== null) return
    fetch('/api/hackathons', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { items: [] })
      .then(d => setHackathons(d.items || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [initial])

  return (
    <>
      <PageHero
        title="Hackathons"
        lead="Teams of up to five build against real problems. Judges score every submission out of 100 on one rubric: correctness, code quality, efficiency, documentation and edge cases."
        actions={
          <>
            <a href="#listings" className={btnPrimary}>See hackathons</a>
            <Link href="/contact?topic=pilot" className={btnSecondary}>Host one on CodeSpectra</Link>
          </>
        }
        art={<DeviceShowcase variant="hackathon" compact />}
      />

      {/* Listings */}
      <div id="listings" className="mx-auto max-w-[1200px] scroll-mt-24 px-4 py-14 sm:px-6 lg:px-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : hackathons.length === 0 ? (
          <EmptyState
            className="mx-auto max-w-xl"
            scene="hackathon-team"
            title="No hackathons open right now"
            description="Create a free account and you’ll see new hackathons on your dashboard as soon as they open."
            actionLabel="Create a free account"
            actionHref="/auth/signup"
          />
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {hackathons.map(h => (
              <Card key={h.id} className="group overflow-hidden rounded-3xl border-cs-grid bg-cs-sheet py-0 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-cs-accent/40 hover:shadow-[0_18px_40px_-18px_rgba(47,91,231,0.35)] motion-reduce:hover:translate-y-0">
                <div className="p-7">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <StatusBadge status={h.status} />
                      </div>
                      <h2 className="truncate text-xl font-bold text-cs-ink">{h.name}</h2>
                    </div>
                    <Button size="sm" className="gap-1.5 shrink-0" asChild>
                      <Link href={`/hackathons/${h.slug}`}>
                        View <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                  {h.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{h.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatDate(h.starts_at)} — {formatDate(h.ends_at)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {h.num_teams || 0} teams
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {h.timeout_minutes}min per task
                    </span>
                    {h.tasks?.length > 0 && (
                      <span className="flex items-center gap-1">
                        <ListChecks className="h-3.5 w-3.5" />
                        {h.tasks.length} tasks
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
