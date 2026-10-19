'use client'

import { use } from 'react'
import { BriefcaseBusiness } from 'lucide-react'
import { HiringShell, QueryGate } from '@/components/hiring/shell'
import { JobEditor } from '@/components/hiring/job-editor/job-editor'
import { useAts } from '@/components/hiring/lib/api'
import type { AtsJob } from '@/lib/ats/contract'

export default function EditHiringJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const job = useAts<AtsJob>(`/api/ats/jobs/${encodeURIComponent(id)}`, 'job')
  return (
    <HiringShell
      title={job.data ? `Edit ${job.data.title}` : 'Edit job'}
      description="Changes to the pipeline apply to new moves; candidates already in a stage stay where they are."
      icon={<BriefcaseBusiness />}
    >
      <QueryGate loading={job.loading} error={job.error} hasData={!!job.data} onRetry={job.reload} />
      {job.data && <JobEditor key={job.data.id} initial={job.data} jobId={job.data.id} />}
    </HiringShell>
  )
}
