'use client'

import Link from 'next/link'
import { ArrowRight, Briefcase, CalendarClock, CheckCheck, Plus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Panel, Section, StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { HiringShell } from '@/components/hiring/shell'
import { BarList, ErrorState, LoadingRows } from '@/components/hiring/ui'
import { useAts } from '@/components/hiring/lib/api'
import { JOB_STATUS_LABELS, JOB_STATUS_VARIANT, timeAgo } from '@/components/hiring/lib/labels'
import type { AnalyticsResponse, ApprovalItem, AtsInterview, JobListItem } from '@/components/hiring/lib/types'
import { useLocaleDates } from '@/lib/i18n/use-dates'
import { useT } from '@/lib/i18n/client'

export default function HiringOverviewPage() {
  const { formatDateTime } = useLocaleDates()
  const { t } = useT()
  const jobs = useAts<JobListItem[]>('/api/ats/jobs', 'jobs')
  const approvals = useAts<ApprovalItem[]>('/api/ats/approvals', 'approvals')
  const analytics = useAts<AnalyticsResponse>('/api/ats/analytics')
  const interviews = useAts<AtsInterview[]>('/api/ats/interviews?scope=all&status=scheduled', 'interviews')

  const openJobs = (jobs.data ?? []).filter((j) => j.status === 'open')
  const inPipeline =
    analytics.data?.active ?? (jobs.data ?? []).reduce((n, j) => n + (j.counts?.active ?? 0), 0)
  const now = Date.now()
  const weekAhead = now + 7 * 86_400_000
  const thisWeek = (interviews.data ?? [])
    .filter((i) => i.status === 'scheduled' && i.scheduled_at && new Date(i.scheduled_at).getTime() >= now - 3_600_000 && new Date(i.scheduled_at).getTime() <= weekAhead)
    .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime())
  const pending = approvals.data ?? []
  const noAccess = jobs.error?.status === 403 || jobs.error?.status === 401

  const dash = (q: { loading: boolean; error: unknown }, v: React.ReactNode) => (q.loading ? '…' : q.error ? '—' : v)

  return (
    <HiringShell
      title={t('hiring.hiring')}
      description={t('hiring.yourOpenRolesWhoIsMoving3fe')}
      icon={<Briefcase />}
      actions={
        <Button asChild className="rounded-full">
          <Link href="/dashboard/hiring/jobs/new"><Plus aria-hidden />{' '}{t('hiring.newJob')}</Link>
        </Button>
      }
    >
      {noAccess ? (
        <EmptyState
          illustration="locked"
          title={t('hiring.thisOverviewIsForRecruiters')}
          description={jobs.error?.message || t('hiring.yourHiringRoleDoesNotInclude622')}
          actionLabel={t('hiring.myInterviews')}
          actionHref="/dashboard/hiring/interviews"
        />
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t('hiring.openJobs')} value={dash(jobs, openJobs.length)} icon={<Briefcase />} />
            <StatCard label={t('hiring.candidatesInPipeline')} value={dash(jobs, inPipeline)} icon={<Users />} />
            <StatCard label={t('hiring.waitingForApproval')} value={dash(approvals, pending.length)} icon={<CheckCheck />} />
            <StatCard label={t('hiring.interviewsThisWeek')} value={dash(interviews, thisWeek.length)} icon={<CalendarClock />} />
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <Panel className="lg:col-span-3">
              <Section
                title={t('hiring.funnel')}
                description={t('hiring.candidatesWhoReachedEachStageAcross08d')}
                actions={<Link href="/dashboard/hiring/analytics" className="text-sm font-medium text-primary hover:underline">{t('hiring.fullAnalytics')}</Link>}
              >
                {analytics.loading && !analytics.data ? (
                  <LoadingRows rows={3} />
                ) : analytics.error ? (
                  <ErrorState compact message={analytics.error.message} onRetry={analytics.reload} />
                ) : !analytics.data?.total ? (
                  <EmptyState compact illustration="analytics" title={t('hiring.noCandidatesYet')} description={t('hiring.theFunnelFillsInAsPeopleacb')} />
                ) : (
                  <BarList
                    caption={t('hiring.candidatesPerStage')}
                    rows={analytics.data.funnel.filter((f) => f.type !== 'rejected').map((f) => ({ label: f.name, value: f.reached, hint: f.conversion_pct != null ? t('hiring.nOfThePreviousStage', { n: Math.round(f.conversion_pct) }) : undefined }))}
                  />
                )}
              </Section>
            </Panel>

            <Panel className="lg:col-span-2">
              <Section
                title={t('hiring.waitingForYou')}
                actions={pending.length > 0 && <Link href="/dashboard/hiring/approvals" className="text-sm font-medium text-primary hover:underline">{t('hiring.seeAll')}</Link>}
              >
                {approvals.loading && !approvals.data ? (
                  <LoadingRows rows={3} />
                ) : approvals.error ? (
                  <ErrorState compact message={approvals.error.message} onRetry={approvals.reload} />
                ) : pending.length === 0 ? (
                  <EmptyState compact illustration="success" title={t('hiring.nothingToApprove')} description={t('hiring.suggestedMovesThatNeedYourOkf3c')} />
                ) : (
                  <ul className="divide-y divide-border">
                    {pending.slice(0, 5).map((a) => (
                      <li key={a.application_id} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <Link href={`/dashboard/hiring/candidates/${a.candidate.id}?app=${a.application_id}`} className="block truncate font-medium text-foreground hover:text-primary">
                            {a.candidate.name}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">{t('hiring.titleMoveTo', { title: a.job.title })}{' '}{a.to?.name ?? t('hiring.nextStage2')}</p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.suggested_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <Panel className="lg:col-span-3">
              <Section
                title={t('hiring.openJobs')}
                actions={<Link href="/dashboard/hiring/jobs" className="text-sm font-medium text-primary hover:underline">{t('hiring.allJobs')}</Link>}
              >
                {jobs.loading && !jobs.data ? (
                  <LoadingRows rows={3} />
                ) : jobs.error ? (
                  <ErrorState compact message={jobs.error.message} onRetry={jobs.reload} />
                ) : (jobs.data ?? []).length === 0 ? (
                  <EmptyState compact illustration="jobs" title={t('hiring.noJobsYet')} description={t('hiring.createAJobSetItsPipeline9bc')} actionLabel={t('hiring.newJob')} actionHref="/dashboard/hiring/jobs/new" />
                ) : (
                  <ul className="divide-y divide-border">
                    {(openJobs.length ? openJobs : jobs.data ?? []).slice(0, 6).map((j) => (
                      <li key={j.id}>
                        <Link href={`/dashboard/hiring/jobs/${j.id}`} className="group flex items-center justify-between gap-3 rounded-xl py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground group-hover:text-primary">{j.title}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {[j.location, `${j.openings} opening${j.openings === 1 ? '' : 's'}`, j.pending_approvals ? `${j.pending_approvals} to approve` : null].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Badge variant={JOB_STATUS_VARIANT[j.status]}>{JOB_STATUS_LABELS[j.status]}</Badge>
                            <span className="text-sm tabular-nums text-muted-foreground" title={t('hiring.activeCandidates')}>{j.counts?.active ?? 0}</span>
                            <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </Panel>

            <Panel className="lg:col-span-2">
              <Section title={t('hiring.interviewsThisWeek')}>
                {interviews.loading && !interviews.data ? (
                  <LoadingRows rows={2} />
                ) : interviews.error ? (
                  <ErrorState compact message={interviews.error.message} onRetry={interviews.reload} />
                ) : thisWeek.length === 0 ? (
                  <EmptyState compact illustration="calendar" title={t('hiring.noInterviewsThisWeek')} description={t('hiring.scheduledInterviewsForTheNextSevenc13')} />
                ) : (
                  <ul className="divide-y divide-border">
                    {thisWeek.slice(0, 6).map((i) => (
                      <li key={i.id} className="py-3">
                        <Link href={`/dashboard/hiring/candidates/${i.candidate_id}?app=${i.application_id}`} className="font-medium text-foreground hover:text-primary">
                          {formatDateTime(i.scheduled_at!)}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {i.mode === 'f2f' ? t('hiring.faceToFace') : t('hiring.video')} · {i.duration_min} min · {i.panel.map((p) => p.name || p.email).join(', ') || t('hiring.noPanelYet')}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </Panel>
          </div>
        </div>
      )}
    </HiringShell>
  )
}
