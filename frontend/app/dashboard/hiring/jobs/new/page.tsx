'use client'

import { BriefcaseBusiness } from 'lucide-react'
import { HiringShell } from '@/components/hiring/shell'
import { JobEditor } from '@/components/hiring/job-editor/job-editor'
import { useT } from '@/lib/i18n/client'

export default function NewHiringJobPage() {
  const { t } = useT()
  return (
    <HiringShell
      title={t('hiring.newJob')}
      description={t('hiring.describeTheRoleSetHowR410')}
      icon={<BriefcaseBusiness />}
    >
      <JobEditor />
    </HiringShell>
  )
}
