'use client'
import { useLocaleDates } from '@/lib/i18n/use-dates'

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
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'

interface AppliedJob {
  id: string
  jobId: string
  jobTitle: string
  company: string
  appliedAt: string
  status: 'submitted' | 'in_review' | 'rejected' | 'accepted' | 'withdrawn'
  resumeName: string | null
}

const STATUS_CONFIG = (t: Translator): Record<AppliedJob['status'], { label: string; color: string; icon: any }> => ({
  submitted:   { label: t('career.submitted'),   color: 'bg-primary/10 text-primary',                                 icon: Hourglass },
  in_review:   { label: t('career.inReview'),   color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',        icon: Clock },
  rejected:    { label: t('career.rejected'),    color: 'bg-red-500/15 text-red-700 dark:text-red-400',              icon: XCircle },
  accepted:    { label: t('career.accepted'),    color: 'bg-green-500/15 text-green-700 dark:text-green-400',        icon: CheckCircle },
  withdrawn:   { label: t('career.withdrawn'),   color: 'bg-muted text-muted-foreground',                            icon: XCircle },
})

export default function DashboardJobsPage() {
  const { formatDate } = useLocaleDates()
  const { t } = useT()
  const { user } = useAuth()
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()
  const addToast = useToast()
  const [applications, setApplications] = useState<AppliedJob[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!gate.ready || !user) return
    setLoading(true)
    setLoadError(false)
    fetch('/api/jobs/applications', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then(data => { if (Array.isArray(data)) setApplications(data) })
      .catch(() => { setLoadError(true); addToast({ type: 'error', title: t('career.error'), message: t('career.failedToLoadApplications') }) })
      .finally(() => setLoading(false))
  }, [gate.ready, user, reloadKey])

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready) {
      const jobsTour: TourStep[] = [
        {
          target: '[data-tour="jobs-header"]',
          title: t('career.trackApplications'),
          description: t('career.everyJobYouApplyToShowsdb9'),
          position: 'bottom',
        },
        {
          target: '[data-tour="jobs-browse"]',
          title: t('career.findNewRoles'),
          description: t('career.browseOpenPositionsAndApplyTob5d'),
          position: 'bottom',
        },
        {
          target: '[data-tour="jobs-list"]',
          title: t('career.followEachStatus'),
          description: t('career.watchApplicationsMoveFromSubmittedTo096'),
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
          illustration="jobs"
          className="mb-0"
          icon={<Briefcase aria-hidden />}
          title={t('career.myApplications')}
          description={t('career.trackTheJobsYouveAppliedTo2f2')}
          actions={
            <Button variant="outline" asChild className="gap-1.5" data-tour="jobs-browse">
              <Link href="/jobs">{t('career.browseJobs')}{' '}<ArrowRight className="h-4 w-4" /></Link>
            </Button>
          }
        />
      </div>

      <div data-tour="jobs-list">
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : loadError ? (
        <EmptyState
          illustration="error"
          title={t('career.couldntLoadYourApplications')}
          description={t('career.checkYourConnectionAndTryAgain')}
          actionLabel={t('common.tryAgain')}
          onAction={() => setReloadKey(k => k + 1)}
        />
      ) : applications.length === 0 ? (
        <EmptyState illustration="jobs"
          title={t('career.noApplicationsYet')}
          description={t('career.browseOpenPositionsAndApplyTo7cd')}
          actionLabel={t('career.browseOpenJobs')}
          actionHref="/jobs"
        />
      ) : (
        <div className="space-y-3">
          {applications.map(app => {
            const cfg = STATUS_CONFIG(t)[app.status] ?? STATUS_CONFIG(t).submitted
            const Icon = cfg.icon
            return (
              <Card key={app.id} className="rounded-2xl border-border/70 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Briefcase className="h-5 w-5 text-primary" aria-hidden />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{app.jobTitle || t('career.untitledPosition')}</p>
                    <p className="text-sm text-muted-foreground truncate">{app.company || t('career.company')}</p>
                  </div>
                  <Badge className={`gap-1 ${cfg.color} shrink-0`}>
                    <Icon className="h-3 w-3" />
                    {cfg.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs tabular-nums text-muted-foreground hidden sm:block">{t('career.appliedDate', { date: formatDate(app.appliedAt) })}</span>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/jobs/${app.jobId}`} target="_blank">{t('career.viewJob')}{' '}<ExternalLink className="h-3 w-3 ml-1" />
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
        <p className="text-sm text-muted-foreground mb-2">{t('career.lookingForMoreOpportunities')}</p>
        <Button asChild><Link href="/jobs">{t('career.exploreOpenPositions')}</Link></Button>
      </div>
    </div>
  )
}