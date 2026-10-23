'use client'

/** New cohort (organisation admins and superadmins; the API checks the role). */
import { useRouter } from 'next/navigation'
import { Users } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useT } from '@/lib/i18n/client'
import { PageHeader } from '@/components/app/page-kit'
import { CohortForm } from '@/components/cohorts/cohort-form'

export default function NewCohortPage() {
  const gate = usePageGuard('tenant_admin')
  const { t } = useT()
  const router = useRouter()
  if (!gate.ready) return null
  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title={t('community.newCohort')} description={t('community.newCohortLead')} icon={<Users />} />
      <CohortForm onSaved={(c) => router.push(`/dashboard/cohorts/${c.id}`)} />
    </div>
  )
}
