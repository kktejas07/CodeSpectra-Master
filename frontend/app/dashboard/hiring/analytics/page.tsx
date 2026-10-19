'use client'

import { useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { HiringShell, QueryGate } from '@/components/hiring/shell'
import { AnalyticsView } from '@/components/hiring/analytics-view'
import { NativeSelect } from '@/components/hiring/ui'
import { useAts } from '@/components/hiring/lib/api'
import type { AnalyticsResponse, JobListItem } from '@/components/hiring/lib/types'

export default function HiringAnalyticsPage() {
  const [jobId, setJobId] = useState('')
  const jobs = useAts<JobListItem[]>('/api/ats/jobs', 'jobs')
  const q = useAts<AnalyticsResponse>(`/api/ats/analytics${jobId ? `?job_id=${encodeURIComponent(jobId)}` : ''}`)
  return (
    <HiringShell
      title="Hiring analytics"
      description="Funnel, time to hire and where candidates come from."
      icon={<BarChart3 />}
      actions={
        (jobs.data?.length ?? 0) > 0 && (
          <NativeSelect aria-label="Job" value={jobId} onChange={setJobId} placeholder="All jobs" className="w-56" options={(jobs.data ?? []).map((j) => ({ value: j.id, label: j.title }))} />
        )
      }
    >
      <QueryGate loading={q.loading} error={q.error} hasData={!!q.data} onRetry={q.reload} />
      {q.data && <AnalyticsView data={q.data} jobs={jobId ? undefined : jobs.data ?? undefined} />}
    </HiringShell>
  )
}
