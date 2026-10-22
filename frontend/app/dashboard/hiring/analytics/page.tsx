'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { BarChart3 } from 'lucide-react'
import { HiringShell, QueryGate } from '@/components/hiring/shell'
import { AnalyticsView } from '@/components/hiring/analytics-view'
import { AssessmentAnalytics } from '@/components/hiring/assessment-analytics'
import { DigestSettings, FunnelInsights, InterviewerInsights, PerformanceInsights, SourcesInsights, TestInsights } from '@/components/hiring/insights'
import { NativeSelect } from '@/components/hiring/ui'
import { useAts } from '@/components/hiring/lib/api'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { AnalyticsResponse, JobListItem } from '@/components/hiring/lib/types'
import { useT } from '@/lib/i18n/client'

const PRESETS = ['30d', '90d', '180d', '365d', 'all'] as const

export default function HiringAnalyticsPage() {
  const { t } = useT()
  const search = useSearchParams()
  const [tab, setTab] = useState('overview')
  const [jobId, setJobId] = useState('')
  const [preset, setPreset] = useState<(typeof PRESETS)[number]>('90d')
  const jobs = useAts<JobListItem[]>('/api/ats/jobs', 'jobs')
  const since = preset === 'all' ? '' : new Date(Date.now() - parseInt(preset, 10) * 86_400_000).toISOString().slice(0, 10)
  const q = useAts<AnalyticsResponse>(tab === 'pipeline' ? `/api/ats/analytics?${new URLSearchParams({ ...(jobId ? { job_id: jobId } : {}), ...(since ? { since } : {}) }).toString()}` : null)
  // Filters shared by the insight tabs (server re-validates and scopes them to the organisation).
  const filters = useMemo(() => new URLSearchParams({ ...(jobId ? { job_id: jobId } : {}), ...(preset !== 'all' ? { preset } : {}) }), [jobId, preset])
  const digestNote = search.get('digest')
  const filtered = tab !== 'overview'
  return (
    <HiringShell
      title={t('hiring.analytics')}
      description={t('hiring.assessmentsCandidateAndHiringFunnelsTime31a')}
      icon={<BarChart3 />}
      actions={
        filtered && (
          <div className="flex flex-wrap gap-2">
            {tab !== 'tests' && (jobs.data?.length ?? 0) > 0 && (
              <NativeSelect aria-label={t('hiring.job')} value={jobId} onChange={setJobId} placeholder={t('hiring.allJobs')} className="w-56" options={(jobs.data ?? []).map((j) => ({ value: j.id, label: j.title }))} />
            )}
            <NativeSelect aria-label={t('hiring.insPeriod')} value={preset} onChange={(v) => setPreset(v as (typeof PRESETS)[number])} className="w-40"
              options={PRESETS.map((p) => ({ value: p, label: p === 'all' ? t('hiring.insAllTime') : t('hiring.insLastDays', { count: parseInt(p, 10) }) }))} />
          </div>
        )
      }
    >
      {digestNote === 'unsubscribed' && <p role="status" className="mb-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">{t('hiring.insDigestUnsubscribed')}</p>}
      {digestNote === 'invalid' && <p role="alert" className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">{t('hiring.insDigestLinkInvalid')}</p>}
      <Tabs value={tab} onValueChange={setTab} className="gap-5">
        <div className="max-w-full overflow-x-auto">
          <TabsList className="w-max">
            <TabsTrigger value="overview">{t('hiring.overviewAssessments')}</TabsTrigger>
            <TabsTrigger value="pipeline">{t('hiring.hiringPipeline')}</TabsTrigger>
            <TabsTrigger value="funnel">{t('hiring.insTabFunnel')}</TabsTrigger>
            <TabsTrigger value="sources">{t('hiring.insTabSources')}</TabsTrigger>
            <TabsTrigger value="tests">{t('hiring.insTabTests')}</TabsTrigger>
            <TabsTrigger value="interviewers">{t('hiring.insTabInterviewers')}</TabsTrigger>
            <TabsTrigger value="performance">{t('hiring.insTabPerformance')}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overview" className="space-y-6"><AssessmentAnalytics /><DigestSettings /></TabsContent>
        <TabsContent value="pipeline">
          <QueryGate loading={q.loading} error={q.error} hasData={!!q.data} onRetry={q.reload} />
          {q.data && <AnalyticsView data={q.data} jobs={jobId ? undefined : jobs.data ?? undefined} />}
        </TabsContent>
        <TabsContent value="funnel">{tab === 'funnel' && <FunnelInsights filters={filters} />}</TabsContent>
        <TabsContent value="sources">{tab === 'sources' && <SourcesInsights filters={filters} />}</TabsContent>
        <TabsContent value="tests">{tab === 'tests' && <TestInsights filters={filters} />}</TabsContent>
        <TabsContent value="interviewers">{tab === 'interviewers' && <InterviewerInsights filters={filters} />}</TabsContent>
        <TabsContent value="performance">{tab === 'performance' && <PerformanceInsights filters={filters} />}</TabsContent>
      </Tabs>
    </HiringShell>
  )
}
