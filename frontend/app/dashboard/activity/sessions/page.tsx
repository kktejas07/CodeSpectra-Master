'use client'
import { formatDateTime } from '@/lib/format-datetime'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Video } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { SkeletonText, SkeletonList } from '@/components/ui/skeleton-boneyard'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/app/page-kit'

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
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!gate.ready) return
    setLoading(true)
    setLoadError(false)
    fetch('/api/user/my-sessions', { credentials: 'include' })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then((d) => setSessions(d.sessions || []))
      .catch(() => { setSessions([]); setLoadError(true) })
      .finally(() => setLoading(false))
  }, [gate.ready, reloadKey])

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready) {
      const sessionsTour: TourStep[] = [
        {
          target: '[data-tour="sessions-header"]',
          title: 'Sessions linked to you',
          description: 'This page lists interview and mock sessions linked to your account.',
          position: 'bottom',
        },
        {
          target: '[data-tour="sessions-action"]',
          title: 'Browse interview sessions',
          description: 'Follow this button to the interviews page to schedule or browse sessions.',
          position: 'bottom',
        },
        {
          target: '[data-tour="sessions-list"]',
          title: 'Review sessions, open details',
          description: 'Review each session status here and click a card to open it; if empty, try interview prep next.',
          position: 'top',
        },
      ]
      autoPlayPageTour('sessions', sessionsTour)}
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
      <div data-tour="sessions-header">
        <PageHeader
          illustration="calendar"
          className="mb-0"
          icon={<Video aria-hidden />}
          title="My sessions"
          description="Interview and mock sessions linked to your account."
          actions={
            <Button asChild size="sm" data-tour="sessions-action">
              <Link href="/dashboard/interviews">Schedule / browse</Link>
            </Button>
          }
        />
      </div>
      <div data-tour="sessions-list">
      {loadError ? (
        <EmptyState
          illustration="error"
          title="Couldn't load your sessions"
          description="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => setReloadKey((k) => k + 1)}
        />
      ) : sessions.length === 0 ? (
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
                <Card className="flex items-center justify-between gap-3 rounded-2xl border-border/70 p-3 transition-colors duration-200 hover:border-primary/30 hover:bg-muted/40">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{s.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {[s.type, s.role].filter(Boolean).join(' · ')}
                      {s.scheduledAt ? ` · ${formatDateTime(s.scheduledAt)}` : ''}
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
