import type { Metadata } from 'next'
import { EmptyState } from '@/components/ui/empty-state'

/**
 * Shown (via proxy rewrite, URL kept) to signed-in users while the
 * superadmin has Maintenance mode on (lib/auth-policy.ts). Platform admins
 * keep full access.
 */
export const metadata: Metadata = { title: 'Down for maintenance' }
export const dynamic = 'force-dynamic'

export default function MaintenancePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
      <EmptyState
        illustration="settings"
        title="We’ll be right back"
        description="CodeSpectra is down for scheduled maintenance. Your work is saved — please try again in a little while."
        actionLabel="Go to the home page"
        actionHref="/"
        className="max-w-xl"
      />
    </main>
  )
}
