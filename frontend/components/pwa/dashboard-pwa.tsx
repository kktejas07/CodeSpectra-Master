'use client'

/**
 * Signed-in app extras (mounted once in app/dashboard/dashboard-shell.tsx):
 * bottom navigation for the installed app, the install card, and claiming the
 * device's offline store for this account (another account's data is wiped).
 */
import { useEffect } from 'react'
import { BottomNav } from './bottom-nav'
import { InstallPrompt } from './install-prompt'

export function DashboardPwa({ userId }: { userId?: string }) {
  useEffect(() => {
    if (!userId) return
    import('@/lib/pwa/offline-store').then((m) => m.ensureOwner(userId)).catch(() => undefined)
  }, [userId])

  return (
    <>
      <BottomNav />
      <InstallPrompt />
    </>
  )
}
