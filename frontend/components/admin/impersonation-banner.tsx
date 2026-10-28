'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { csrfFetch } from '@/lib/csrf-fetch'
import { LogIn, ShieldX } from 'lucide-react'
import { useT } from '@/lib/i18n/client'

/**
 * Full-width banner shown while a superadmin is impersonating another user.
 * Provides the one-click "Exit impersonation" path that restores the admin's
 * original session cookie.
 */
export function ImpersonationBanner() {
  const [active, setActive] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [exitError, setExitError] = useState<string | null>(null)
  // Rendered in the dashboard shell (not the admin console), so it uses the bundled `nav` catalog.
  const { t } = useT()

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/impersonate', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (!cancelled && data?.impersonating) setActive(true) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const exitImpersonation = async () => {
    setExiting(true)
    setExitError(null)
    try {
      const res = await csrfFetch('/api/admin/impersonate/stop', {
        method: 'POST',
        credentials: 'include',
      })
      if (res.ok) {
        // Single hard navigation back to the tenant list. Full reload is required
        // to re-read the restored session cookie (router.replace+refresh+reload
        // triple-fired duplicate TTFB/navigation records and could re-trigger the
        // banner's impersonation check mid-loop).
        window.location.href = '/dashboard/admin/organizations'
        return
      }
      setExitError(t('nav.exitImpersonationFailed'))
      setExiting(false)
    } catch {
      setExitError(t('nav.exitImpersonationOffline'))
      setExiting(false)
    }
  }

  if (!active) return null

  return (
    <div role="status" className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-300">
      <LogIn className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        {t('nav.impersonating')}
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-6 shrink-0 gap-1 border-amber-500/40 px-2 text-[11px]"
        onClick={() => void exitImpersonation()}
        disabled={exiting}
      >
        <ShieldX className="h-3 w-3" aria-hidden /> {exiting ? t('nav.exitingImpersonation') : t('nav.exitImpersonation')}
      </Button>
      {exitError && <span role="alert" className="shrink-0 font-medium text-destructive">{exitError}</span>}
    </div>
  )
}
