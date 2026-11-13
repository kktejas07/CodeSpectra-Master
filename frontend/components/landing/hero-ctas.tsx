'use client'

/** Session-aware hero buttons for the (server-rendered) landing page. */
import Link from 'next/link'
import { useHasUserSession } from '@/hooks/use-has-user-session'
import { DASHBOARD_HREF } from '@/app/public-layout'
import { useLocalizedHref } from '@/components/i18n/public-language'
import { useT } from '@/lib/i18n/client'

export function HeroCtas() {
  const hasSession = useHasUserSession()
  const { t } = useT()
  const lp = useLocalizedHref()
  return (
    <div className="mt-9 flex flex-col gap-3 sm:flex-row">
      <Link
        href={lp('/contact')}
        className="inline-flex h-12 items-center justify-center rounded-full bg-cs-ink px-7 text-[15px] font-semibold text-cs-paper outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-cs-accent focus-visible:ring-offset-2 focus-visible:ring-offset-cs-paper"
      >
        {t('public.bookPilot')}
      </Link>
      <Link
        href={hasSession ? DASHBOARD_HREF : '/auth/signup'}
        className="inline-flex h-12 items-center justify-center rounded-full border border-cs-ink/25 px-7 text-[15px] font-semibold text-cs-ink outline-none transition-colors hover:border-cs-ink focus-visible:ring-2 focus-visible:ring-cs-accent focus-visible:ring-offset-2 focus-visible:ring-offset-cs-paper"
      >
        {hasSession ? t('public.goToDashboard') : t('public.createFreeAccount')}
      </Link>
    </div>
  )
}
