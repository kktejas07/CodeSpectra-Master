'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { getRequiredRoleForRoute } from '@/lib/page-permissions'
import { ROUTE_LABELS } from '@/lib/page-permissions'

/**
 * Fetches the locked_pages list from platform settings and checks
 * whether the current pathname is locked. Superadmins bypass locks.
 */
export function usePageLock() {
  const pathname = usePathname()
  const [lockedPages, setLockedPages] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/platform/locked-pages')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return
        setLockedPages(Array.isArray(data?.locked_pages) ? data.locked_pages : [])
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const isPageLocked = useCallback((path: string) => {
    const base = path.split('?')[0]
    return lockedPages.some(route =>
      base === route || base.startsWith(route + '/')
    )
  }, [lockedPages])

  const locked = !loading && isPageLocked(pathname)

  const routeLabel = (() => {
    const base = pathname.split('?')[0]
    if (ROUTE_LABELS[base]) return ROUTE_LABELS[base]
    for (const [route, label] of Object.entries(ROUTE_LABELS)) {
      if (base.startsWith(route + '/')) return label
    }
    return null
  })()

  return {
    locked,
    loading,
    lockedPages,
    routeLabel,
    isPageLocked,
    setLockedPages,
  }
}
