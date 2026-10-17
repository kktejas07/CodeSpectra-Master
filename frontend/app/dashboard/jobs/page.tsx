'use client'
import { formatDate } from '@/lib/format-datetime'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { useToast } from '@/lib/toast-context'
import {
  Briefcase, ExternalLink, Clock,
  CheckCircle, XCircle, Hourglass, ArrowRight,
} from 'lucide-react'
import { SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'

interface AppliedJob {
  id: string
  jobId: string
  jobTitle: string
  company: string
  appliedAt: string
  status: 'submitted' | 'in_review' | 'rejected' | 'accepted' | 'withdrawn'
  resumeName: string | null
}

const STATUS_CONFIG: Record<AppliedJob['status'], { label: string; color: string; icon: any }> = {
  submitted:   { label: 'Submitted',   color: 'bg-primary/10 text-primary',                                 icon: Hourglass },
  in_review:   { label: 'In review',   color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',        icon: Clock },
  rejected:    { label: 'Rejected',    color: 'bg-red-500/15 text-red-700 dark:text-red-400',              icon: XCircle },
  accepted:    { label: 'Accepted',    color: 'bg-green-500/15 text-green-700 dark:text-green-400',        icon: CheckCircle },
  withdrawn:   { label: 'Withdrawn',   color: 'bg-muted text-muted-foreground',                            icon: XCircle },
}

export default function DashboardJobsPage() {
  const { user } = useAuth()
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()
  const addToast = useToast()
  const [applications, setApplications] = useState<AppliedJob[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!gate.ready || !user) return
    fetch('/api/jobs/applications', { credentials: 'include' })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setApplications(data) })
      .catch(() => addToast({ type: 'error', title: 'Error', message: 'Failed to load applications' }))
      .finally(() => setLoading(false))
  }, [gate.ready, user])

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready) {
      const jobsTour: TourStep[] = [
        {
          target: '[data-tour="jobs-header"]',
          title: 'Track applications',
          description: 'Every job you apply to shows up here with its current status.',
          position: 'bottom',
        },
        {
          target: '[data-tour="jobs-browse"]',
          title: 'Find new roles',
          description: 'Browse open positions and apply to the ones that interest you.',
          position: 'bottom',
        },
        {
          target: '[data-tour="jobs-list"]',
          title: 'Follow each status',
          description: 'Watch applications move from submitted to review, accepted, or rejected.',
          position: 'top',
        },
      ]
      autoPlayPageTour('jobs', jobsTour)}
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready) return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-40 bg-muted/60 rounded animate-pulse" />
          <div className="h-4 w-56 bg-muted/40 rounded animate-pulse" />
        </div>
        <div className="h-9 w-28 bg-muted/50 rounded animate-pulse" />
      </div>
      <SkeletonCard />
    </div>
  )

  return (
    <div className="space-y-6">
      <div data-tour="jobs-header">
        <PageHeader
          className="mb-0"
          icon={<Briefcase aria-hidden />}
          title="My applications"
          description="Track the jobs you've applied to and where each application stands."
          actions={
            <Button variant="outline" asChild className="gap-1.5" data-tour="jobs-browse">
              <Link href="/jobs">Browse jobs <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          }
        />
      </div>

      <div data-tour="jobs-list">
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : applications.length === 0 ? (
        <EmptyState
          title="No applications yet"
          description="Browse open positions and apply to ones that interest you. Your applications will show up here."
          actionLabel="Browse open jobs"
          actionHref="/jobs"
        />
      ) : (
        <div className="space-y-3">
          {applications.map(app => {
            const cfg = STATUS_CONFIG[app.status] ?? STATUS_CONFIG.submitted
            const Icon = cfg.icon
            return (
              <Card key={app.id} className="rounded-2xl border-border/70 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Briefcase className="h-5 w-5 text-primary" aria-hidden />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{app.jobTitle || 'Untitled position'}</p>
                    <p className="text-sm text-muted-foreground truncate">{app.company || 'Company'}</p>
                  </div>
                  <Badge className={`gap-1 ${cfg.color} shrink-0`}>
                    <Icon className="h-3 w-3" />
                    {cfg.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs tabular-nums text-muted-foreground hidden sm:block">
                    Applied {formatDate(app.appliedAt)}
                  </span>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/jobs/${app.jobId}`} target="_blank">
                      View job <ExternalLink className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
      </div>

      <div className="border-t border-border pt-6">
        <p className="text-sm text-muted-foreground mb-2">Looking for more opportunities?</p>
        <Button asChild><Link href="/jobs">Explore open positions</Link></Button>
      </div>
    </div>
  )
}