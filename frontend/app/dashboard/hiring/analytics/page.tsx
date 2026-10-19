'use client'

import { useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { HiringShell, QueryGate } from '@/components/hiring/shell'
import { AnalyticsView } from '@/components/hiring/analytics-view'
import { AssessmentAnalytics } from '@/components/hiring/assessment-analytics'
import { NativeSelect } from '@/components/hiring/ui'
import { useAts } from '@/components/hiring/lib/api'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { AnalyticsResponse, JobListItem } from '@/components/hiring/lib/types'

export default function HiringAnalyticsPage() {
  const [tab, setTab] = useState('overview')
  const [jobId, setJobId] = useState('')
  const jobs = useAts<JobListItem[]>('/api/ats/jobs', 'jobs')
  const q = useAts<AnalyticsResponse>(tab === 'pipeline' ? `/api/ats/analytics${jobId ? `?job_id=${encodeURIComponent(jobId)}` : ''}` : null)
  return (
    <HiringShell
      title="Analytics"
      description="Assessments, candidate and hiring funnels, time to hire and where candidates come from."
      icon={<BarChart3 />}
      actions={
        tab === 'pipeline' && (jobs.data?.length ?? 0) > 0 && (
          <NativeSelect aria-label="Job" value={jobId} onChange={setJobId} placeholder="All jobs" className="w-56" options={(jobs.data ?? []).map((j) => ({ value: j.id, label: j.title }))} />
        )
      }
    >
      <Tabs value={tab} onValueChange={setTab} className="gap-5">
        <TabsList className="w-max">
          <TabsTrigger value="overview">Overview & assessments</TabsTrigger>
          <TabsTrigger value="pipeline">Hiring pipeline</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><AssessmentAnalytics /></TabsContent>
        <TabsContent value="pipeline">
          <QueryGate loading={q.loading} error={q.error} hasData={!!q.data} onRetry={q.reload} />
          {q.data && <AnalyticsView data={q.data} jobs={jobId ? undefined : jobs.data ?? undefined} />}
        </TabsContent>
      </Tabs>
    </HiringShell>
  )
}
