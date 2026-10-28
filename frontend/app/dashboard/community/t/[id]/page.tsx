'use client'

/** A thread inside the app (members-only cohort threads, your pending posts); public threads also live at /community/t/[id]. */
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { usePageGuard } from '@/lib/use-page-guard'
import { useT } from '@/lib/i18n/client'
import { ThreadView } from '@/components/community/thread-view'

export default function DashboardThreadPage() {
  const gate = usePageGuard('user')
  const { t } = useT()
  const { id = '' } = useParams<{ id: string }>()
  const pending = useSearchParams().get('pending') === '1'
  if (!gate.ready) return null
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <nav aria-label={t('community.breadcrumbs')} className="text-sm text-muted-foreground"><Link href="/dashboard/community" className="hover:text-foreground">{t('community.myCommunity')}</Link></nav>
      {pending && <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-foreground">{t('community.threadPending')}</p>}
      <ThreadView id={id} initial={null} signInHref="/auth/login" />
    </div>
  )
}
