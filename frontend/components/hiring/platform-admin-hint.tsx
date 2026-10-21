'use client'

import Link from 'next/link'
import { platformSettingsHref } from '@/lib/platform-settings-nav'
import { useT } from '@/lib/i18n/client'

/**
 * Where a hiring feature needs a platform-level key: platform admins get a link
 * to Admin → Settings → Hiring integrations; everyone else is told who to ask.
 */
export function PlatformAdminHint({ isPlatformAdmin, what, className }: { isPlatformAdmin: boolean; what: string; className?: string }) {
  const { t } = useT()
  return (
    <p className={className ?? 'text-sm text-amber-700 dark:text-amber-400'}>
      {isPlatformAdmin ? (
        <>{t('hiring.addTheWhatIn', { what })}{' '}<Link href={platformSettingsHref('hiring')} className="font-medium underline underline-offset-2 hover:text-foreground">{t('hiring.adminSettingsHiringIntegrations')}</Link>
          .
        </>
      ) : (
        <>{t('hiring.askYourPlatformAdminToAdd980', { what })}</>
      )}
    </p>
  )
}
