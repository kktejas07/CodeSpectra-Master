'use client'
import { formatDate as tzFormatDate } from '@/lib/format-datetime'

import { useEffect, useState } from 'react'
import { PublicPageWrapper } from '@/app/public-layout'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Trophy, Users, Clock, CalendarDays, ArrowRight, ListChecks } from 'lucide-react'

interface Hackathon {
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
  if (status === 'active') return <Badge className="bg-green-500/20 text-green-700 border-green-500/30">Live</Badge>
  if (status === 'upcoming') return <Badge className="bg-blue-500/20 text-blue-700 border-blue-500/30">Upcoming</Badge>
  return <Badge variant="outline" className="text-muted-foreground">Ended</Badge>
}

export default function PublicHackathonsPage() {
  const [hackathons, setHackathons] = useState<Hackathon[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/hackathons', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { items: [] })
      .then(d => setHackathons(d.items || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <PublicPageWrapper>
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-border/40">
        <div className="absolute inset-0 bg-linear-to-br from-primary/5 via-transparent to-primary/3 pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-6 py-16 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary mb-6">
            <Trophy className="h-3 w-3" />
            Compete & Build
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Hackathons
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Join coding competitions, build projects with your team, and win prizes. Open to all skill levels.
          </p>
        </div>
      </div>

      {/* Listings */}
      <div className="max-w-5xl mx-auto px-6 py-12">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : hackathons.length === 0 ? (
          <div className="text-center py-20">
            <Trophy className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
            <h2 className="text-xl font-semibold mb-2">No hackathons yet</h2>
            <p className="text-muted-foreground">Check back soon for upcoming events.</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {hackathons.map(h => (
              <Card key={h.id} className="border-border/60 overflow-hidden hover:border-primary/30 transition-colors">
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <StatusBadge status={h.status} />
                      </div>
                      <h2 className="text-xl font-bold truncate">{h.name}</h2>
                    </div>
                    <Link href={`/hackathons/${h.slug}`}>
                      <Button size="sm" className="gap-1.5 shrink-0">
                        View <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
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
    </PublicPageWrapper>
  )
}
