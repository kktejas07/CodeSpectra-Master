import Link from 'next/link'
import { platformSettingsHref } from '@/lib/platform-settings-nav'

/**
 * Where a hiring feature needs a platform-level key: platform admins get a link
 * to Admin → Settings → Hiring integrations; everyone else is told who to ask.
 */
export function PlatformAdminHint({ isPlatformAdmin, what, className }: { isPlatformAdmin: boolean; what: string; className?: string }) {
  return (
    <p className={className ?? 'text-sm text-amber-700 dark:text-amber-400'}>
      {isPlatformAdmin ? (
        <>
          Add the {what} in{' '}
          <Link href={platformSettingsHref('hiring')} className="font-medium underline underline-offset-2 hover:text-foreground">
            Admin → Settings → Hiring integrations
          </Link>
          .
        </>
      ) : (
        <>Ask your platform admin to add the {what}.</>
      )}
    </p>
  )
}
