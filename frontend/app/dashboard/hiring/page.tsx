'use client'

import Link from 'next/link'
import { ArrowRight, BarChart3, Briefcase, CalendarClock, CheckCheck, Plus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BentoChart, BentoGrid, BentoList, BentoStat } from '@/components/bento'
import { EmptyState } from '@/components/ui/empty-state'
import { HiringShell } from '@/components/hiring/shell'
import { BarList, ErrorState } from '@/components/hiring/ui'
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
        <BentoGrid cols={4}>
          <BentoStat tone="brand" href="/dashboard/hiring/jobs" title={t('hiring.openJobs')} icon={<Briefcase />} loading={jobs.loading && !jobs.data} loadingLabel={t('hiring.openJobs')} value={dash(jobs, openJobs.length)} />
          <BentoStat href="/dashboard/hiring/candidates" title={t('hiring.candidatesInPipeline')} icon={<Users />} loading={jobs.loading && !jobs.data} loadingLabel={t('hiring.candidatesInPipeline')} value={dash(jobs, inPipeline)} />
          <BentoStat href="/dashboard/hiring/approvals" title={t('hiring.waitingForApproval')} icon={<CheckCheck />} loading={approvals.loading && !approvals.data} loadingLabel={t('hiring.waitingForApproval')} value={dash(approvals, pending.length)} />
          <BentoStat href="/dashboard/hiring/interviews" title={t('hiring.interviewsThisWeek')} icon={<CalendarClock />} loading={interviews.loading && !interviews.data} loadingLabel={t('hiring.interviewsThisWeek')} value={dash(interviews, thisWeek.length)} />

          <BentoChart
            span={2}
            smSpan={2}
            rows={2}
            icon={<BarChart3 />}
            title={t('hiring.funnel')}
            caption={t('hiring.candidatesWhoReachedEachStageAcross08d')}
            more={{ label: t('hiring.fullAnalytics'), href: '/dashboard/hiring/analytics' }}
            loading={analytics.loading && !analytics.data}
            loadingLabel={t('hiring.funnel')}
            empty={
              analytics.error ? <ErrorState compact message={analytics.error.message} onRetry={analytics.reload} />
                : !analytics.loading && !analytics.data?.total ? <EmptyState compact illustration="analytics" title={t('hiring.noCandidatesYet')} description={t('hiring.theFunnelFillsInAsPeopleacb')} />
                : undefined
            }
            chart={
              analytics.data ? (
                <BarList
                  caption={t('hiring.candidatesPerStage')}
                  rows={analytics.data.funnel.filter((f) => f.type !== 'rejected').map((f) => ({ label: f.name, value: f.reached, hint: f.conversion_pct != null ? t('hiring.nOfThePreviousStage', { n: Math.round(f.conversion_pct) }) : undefined }))}
                />
              ) : null
            }
          />

          <BentoList
            span={2}
            smSpan={2}
            icon={<CheckCheck />}
            title={t('hiring.waitingForYou')}
            more={pending.length > 0 ? { label: t('hiring.seeAll'), href: '/dashboard/hiring/approvals' } : undefined}
            loading={approvals.loading && !approvals.data}
            loadingLabel={t('hiring.waitingForYou')}
            items={pending.slice(0, 5).map((a) => ({
              key: a.application_id,
              href: `/dashboard/hiring/candidates/${a.candidate.id}?app=${a.application_id}`,
              primary: a.candidate.name,
              secondary: <>{t('hiring.titleMoveTo', { title: a.job.title })}{' '}{a.to?.name ?? t('hiring.nextStage2')}</>,
              meta: <span className="text-xs">{timeAgo(a.suggested_at)}</span>,
            }))}
            empty={
              approvals.error ? <ErrorState compact message={approvals.error.message} onRetry={approvals.reload} />
                : <EmptyState compact illustration="success" title={t('hiring.nothingToApprove')} description={t('hiring.suggestedMovesThatNeedYourOkf3c')} />
            }
          />

          <BentoList
            span={2}
            smSpan={2}
            icon={<CalendarClock />}
            title={t('hiring.interviewsThisWeek')}
            loading={interviews.loading && !interviews.data}
            loadingLabel={t('hiring.interviewsThisWeek')}
            items={thisWeek.slice(0, 5).map((i) => ({
              key: i.id,
              href: `/dashboard/hiring/candidates/${i.candidate_id}?app=${i.application_id}`,
              primary: formatDateTime(i.scheduled_at!),
              secondary: `${i.mode === 'f2f' ? t('hiring.faceToFace') : t('hiring.video')} · ${i.duration_min} min · ${i.panel.map((p) => p.name || p.email).join(', ') || t('hiring.noPanelYet')}`,
            }))}
            empty={
              interviews.error ? <ErrorState compact message={interviews.error.message} onRetry={interviews.reload} />
                : <EmptyState compact illustration="calendar" title={t('hiring.noInterviewsThisWeek')} description={t('hiring.scheduledInterviewsForTheNextSevenc13')} />
            }
          />

          <BentoList
            span={4}
            icon={<Briefcase />}
            title={t('hiring.openJobs')}
            more={{ label: t('hiring.allJobs'), href: '/dashboard/hiring/jobs' }}
            loading={jobs.loading && !jobs.data}
            loadingLabel={t('hiring.openJobs')}
            items={(openJobs.length ? openJobs : jobs.data ?? []).slice(0, 6).map((j) => ({
              key: j.id,
              href: `/dashboard/hiring/jobs/${j.id}`,
              primary: j.title,
              secondary: [j.location, `${j.openings} opening${j.openings === 1 ? '' : 's'}`, j.pending_approvals ? `${j.pending_approvals} to approve` : null].filter(Boolean).join(' · '),
              meta: (
                <span className="flex items-center gap-2">
                  <Badge variant={JOB_STATUS_VARIANT[j.status]}>{JOB_STATUS_LABELS[j.status]}</Badge>
                  <span className="tabular-nums" title={t('hiring.activeCandidates')}>{j.counts?.active ?? 0}</span>
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </span>
              ),
            }))}
            empty={
              jobs.error ? <ErrorState compact message={jobs.error.message} onRetry={jobs.reload} />
                : <EmptyState compact illustration="jobs" title={t('hiring.noJobsYet')} description={t('hiring.createAJobSetItsPipeline9bc')} actionLabel={t('hiring.newJob')} actionHref="/dashboard/hiring/jobs/new" />
            }
          />
        </BentoGrid>
      )}
    </HiringShell>
  )
}
