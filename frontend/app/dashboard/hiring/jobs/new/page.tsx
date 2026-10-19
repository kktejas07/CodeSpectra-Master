'use client'

import { BriefcaseBusiness } from 'lucide-react'
import { HiringShell } from '@/components/hiring/shell'
import { JobEditor } from '@/components/hiring/job-editor/job-editor'

export default function NewHiringJobPage() {
  return (
    <HiringShell
      title="New job"
      description="Describe the role, set how résumés are screened and build the pipeline. You can change all of it later."
      icon={<BriefcaseBusiness />}
    >
      <JobEditor />
    </HiringShell>
  )
}
