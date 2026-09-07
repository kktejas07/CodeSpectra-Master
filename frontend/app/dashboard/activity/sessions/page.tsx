'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, type TourStep } from '@/components/tour/tour-context'
import { SkeletonText, SkeletonList } from '@/components/ui/skeleton-boneyard'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

type Session = {
  id: string
  title: string
  type: string
  role: string
  status: string
  scheduledAt: string | null
  href: string
}

export default function MySessionsPage() {
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!gate.ready) return
    fetch('/api/user/my-sessions', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions || []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false))
  }, [gate.ready])

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready && !localStorage.getItem('has_seen_sessions_tour')) {
      const sessionsTour: TourStep[] = [
        {
          target: '[data-tour="sessions-header"]',
          title: 'Your sessions',
          description: 'Interview and mock sessions linked to your account live here.',
          position: 'bottom',
        },
        {
          target: '[data-tour="sessions-action"]',
          title: 'Find sessions',
          description: 'Browse or schedule interview sessions to get started.',
          position: 'bottom',
        },
        {
          target: '[data-tour="sessions-list"]',
          title: 'Session history',
          description: 'Upcoming and past sessions appear here with their status.',
          position: 'top',
        },
      ]
      startTour(sessionsTour, 'sessions')
      setTourSeen('sessions')
    }
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready || loading) {
    return (
      <div className="w-full space-y-6">
        <SkeletonText lines={2} />
        <SkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3" data-tour="sessions-header">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Sessions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Interview and mock sessions linked to your account.
          </p>
        </div>
        <Button asChild size="sm" data-tour="sessions-action">
          <Link href="/dashboard/interviews">Schedule / browse</Link>
        </Button>
      </div>
      <div data-tour="sessions-list">
      {sessions.length === 0 ? (
        <EmptyState
          variant="sessions"
          title="No sessions yet"
          description="When you schedule or join an interview session, it will appear here."
          actionLabel="Try interview prep"
          actionHref="/dashboard/interview-prep"
        />
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link href={s.href}>
                <Card className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {[s.type, s.role].filter(Boolean).join(' · ')}
                      {s.scheduledAt ? ` · ${new Date(s.scheduledAt).toLocaleString()}` : ''}
                    </p>
                  </div>
                  <Badge variant="secondary" className="capitalize">
                    {s.status}
                  </Badge>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
      </div>
    </div>
  )
}
