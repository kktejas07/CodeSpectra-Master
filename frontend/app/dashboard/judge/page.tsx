'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Gavel, CalendarDays, Clock, ArrowRight } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { DashboardPageHeader } from '@/components/dashboard/dashboard-page-header'
import { csrfFetch } from '@/lib/csrf-fetch'

interface Hackathon {
  id: string
  name: string
  slug: string
  status: string
  starts_at: string
  ends_at: string
  tasks: { problem_slug: string; problem_title: string }[]
}

export default function JudgeDashboardPage() {
  const gate = usePageGuard('user')
  const [hackathons, setHackathons] = useState<Hackathon[]>([])
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await csrfFetch('/api/hackathons?judge=1', { cache: 'no-store' })
      if (!res.ok) {
        setHackathons([])
        return
      }
      const data = await res.json()
      const items: Hackathon[] = data.items || data || []
      setHackathons(items)

      const counts: Record<string, number> = {}
      await Promise.all(
        items.map(async (h) => {
          try {
            const subRes = await csrfFetch(`/api/hackathons/${h.id}/judge-submissions`, { cache: 'no-store' })
            if (subRes.ok) {
              const subData = await subRes.json()
              const subs = subData.data || []
              counts[h.id] = subs.filter((s: { status: string }) => s.status === 'pending').length
            }
          } catch { /* ignore */ }
        })
      )
      setPendingCounts(counts)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (gate.ready) void load()
  }, [gate.ready, load])

  if (!gate.ready || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading…
      </div>
    )
  }

  return (
    <div className="space-y-6 px-6 py-8">
      <DashboardPageHeader
        icon={Gavel}
        title="Judge Dashboard"
        description="Review and score hackathon submissions."
      />

      {hackathons.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          You are not assigned as a judge for any hackathons.
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {hackathons.map((h) => {
            const pending = pendingCounts[h.id] || 0
            return (
              <Card key={h.id} className="overflow-hidden rounded-xl border-border/60 p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-lg font-semibold">{h.name}</h3>
                  <Badge variant={h.status === 'live' ? 'default' : 'secondary'} className="uppercase shrink-0">
                    {h.status}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />{' '}
                    {new Date(h.starts_at).toLocaleDateString()} – {new Date(h.ends_at).toLocaleDateString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {h.tasks?.length || 0} problems
                  </span>
                </div>
                {pending > 0 && (
                  <Badge variant="destructive" className="w-fit">
                    {pending} pending submission{pending !== 1 ? 's' : ''}
                  </Badge>
                )}
                <Link href={`/dashboard/judge/${h.id}`}>
                  <Button size="sm" variant="outline" className="mt-1">
                    Review submissions <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
