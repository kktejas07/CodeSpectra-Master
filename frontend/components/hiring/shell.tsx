'use client'

/**
 * Page frame for recruiter screens: client page guard (UX only — the hiring
 * layout checks membership and every /api/ats route enforces the ATS role and
 * tenant scope on the server) and the standard page header. Section links
 * live in the dashboard sidebar ("Hiring" group, per ATS role).
 */
import { usePageGuard } from '@/lib/use-page-guard'
import { PageHeader } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState, LoadingRows } from './ui'
import type { AtsError } from './lib/api'
import { useT } from '@/lib/i18n/client'

export function HiringShell({
  title,
  description,
  icon,
  actions,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const gate = usePageGuard('user')
  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader title={title} description={description} icon={icon} actions={gate.ready ? actions : undefined} />
      {gate.ready ? children : <LoadingRows rows={5} />}
    </div>
  )
}

/** Loading / no-access / error for a query; returns null when data is ready. */
export function QueryGate({
  loading,
  error,
  hasData,
  onRetry,
  rows = 4,
}: {
  loading: boolean
  error: AtsError | null
  hasData: boolean
  onRetry: () => void
  rows?: number
}) {
  const { t } = useT()
  if (error && (error.status === 403 || error.status === 401)) {
    return (
      <EmptyState
        illustration="locked"
        title={t('hiring.youCantOpenThis')}
        description={t('hiring.valueAskYourOrganisationsHiringAdmin9ea', { value: error.message.replace(/[.!?]?\s*$/, ".") })}
        actionLabel={t('hiring.backToHiring')}
        actionHref="/dashboard/hiring"
      />
    )
  }
  if (error && !hasData) return <ErrorState message={error.message} onRetry={onRetry} />
  if (loading && !hasData) return <LoadingRows rows={rows} />
  return null
}
