'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useRoleGate } from '@/lib/use-role-gate'
import { getRequiredRoleForRoute } from '@/lib/page-permissions'
import { isSuperAdmin, isAdmin, type UserRole } from '@/lib/rbac'

/** Shared cache for locked pages — avoids per-hook fetches */
let cachedLockedPages: string[] | null = null
let fetchPromise: Promise<string[]> | null = null

function fetchLockedPages(): Promise<string[]> {
  if (cachedLockedPages) return Promise.resolve(cachedLockedPages)
  if (fetchPromise) return fetchPromise
  fetchPromise = fetch('/api/platform/locked-pages')
    .then(r => r.ok ? r.json() : { locked_pages: [] })
    .then(data => {
      const pages = Array.isArray(data?.locked_pages) ? data.locked_pages : []
      cachedLockedPages = pages
      return pages
    })
    .catch(() => {
      cachedLockedPages = []
      return []
    })
  return fetchPromise
}

/** Invalidate cache when settings are updated */
export function invalidateLockedPagesCache() {
  cachedLockedPages = null
  fetchPromise = null
}

export function usePageGuard(
  routeOrRole: string | ('superadmin' | 'tenant_admin' | 'judge' | 'user') = 'user'
) {
  const gate = useRoleGate({ require: 'auth' })
  const pathname = usePathname()
  const [dbAllowed, setDbAllowed] = useState<boolean | null>(null)
  const [lockedPages, setLockedPages] = useState<string[]>([])
  const [locksLoaded, setLocksLoaded] = useState(false)

  const requiredRole = typeof routeOrRole === 'string' && routeOrRole.startsWith('/')
    ? getRequiredRoleForRoute(routeOrRole)
    : routeOrRole as 'superadmin' | 'tenant_admin' | 'user'

  const staticAllowed = gate.user && (() => {
    if (requiredRole === 'user') return true
    if (requiredRole === 'superadmin') return isSuperAdmin(gate.user.role)
    if (requiredRole === 'tenant_admin') return isAdmin(gate.user.role)
    return false
  })()

  // If static check fails, try DB permissions (superadmin may have granted access)
  useEffect(() => {
    if (staticAllowed || !gate.ready || !gate.user) {
      setDbAllowed(staticAllowed)
      return
    }
    let cancelled = false
    const route = typeof routeOrRole === 'string' && routeOrRole.startsWith('/')
      ? routeOrRole
      : ''

    if (!route) {
      setDbAllowed(false)
      return
    }

    fetch('/api/admin/permissions/roles', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.roles) return
        const roleData = data.roles.find((r: any) => r.role === gate.user!.role)
        if (!roleData) { setDbAllowed(false); return }
        const perms = (roleData.permissions || []) as any[]
        const hasAccess = perms.some((p: any) =>
          (p.resourceType === 'page' && (p.actions?.includes('read') || p.actions?.includes('manage'))) &&
          (p.resource === route || route.startsWith(p.resource + '/'))
        )
        setDbAllowed(hasAccess)
      })
      .catch(() => { setDbAllowed(false) })

    return () => { cancelled = true }
  }, [staticAllowed, gate.ready, gate.user, routeOrRole])

  // Fetch locked pages
  useEffect(() => {
    let cancelled = false
    fetchLockedPages().then(pages => {
      if (!cancelled) {
        setLockedPages(pages)
        setLocksLoaded(true)
      }
    })
    return () => { cancelled = true }
  }, [])

  // Check if current pathname is locked (superadmins bypass)
  const locked = gate.ready && locksLoaded && !(gate.user && isSuperAdmin(gate.user.role)) && (() => {
    const base = pathname.split('?')[0]
    return lockedPages.some(route => base === route || base.startsWith(route + '/'))
  })()

  const allowed = gate.ready && (staticAllowed || dbAllowed === true)
  const loading = !gate.ready || (staticAllowed === false && dbAllowed === null)

  return {
    ready: gate.ready && (staticAllowed || dbAllowed !== null) && locksLoaded,
    allowed,
    locked: !!locked,
    user: gate.user,
    loading,
  }
}
