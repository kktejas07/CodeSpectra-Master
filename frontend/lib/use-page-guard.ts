'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useRoleGate } from '@/lib/use-role-gate'
import { getRequiredRoleForRoute } from '@/lib/page-permissions'
import { isSuperAdmin, isAdmin, isJudge, type UserRole } from '@/lib/rbac'

/** Shared cache for locked pages & features — avoids per-hook fetches */
interface LockedData { locked_pages: string[]; locked_features: string[] }
let cachedLockedData: LockedData | null = null
let fetchPromise: Promise<LockedData> | null = null

function fetchLockedData(): Promise<LockedData> {
  if (cachedLockedData) return Promise.resolve(cachedLockedData)
  if (fetchPromise) return fetchPromise
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  fetchPromise = fetch('/api/platform/locked-pages', { signal: controller.signal })
    .then(r => r.ok ? r.json() : { locked_pages: [], locked_features: [] })
    .then(data => {
      clearTimeout(timeout)
      const locked: LockedData = {
        locked_pages: Array.isArray(data?.locked_pages) ? data.locked_pages : [],
        locked_features: Array.isArray(data?.locked_features) ? data.locked_features : [],
      }
      cachedLockedData = locked
      return locked
    })
    .catch(() => {
      clearTimeout(timeout)
      fetchPromise = null // allow retry next time
      cachedLockedData = { locked_pages: [], locked_features: [] }
      return cachedLockedData
    })
  return fetchPromise
}

export function fetchLockedPages(): Promise<string[]> {
  return fetchLockedData().then(d => d.locked_pages)
}

function fetchLockedFeatures(): Promise<string[]> {
  return fetchLockedData().then(d => d.locked_features)
}

/** Invalidate cache when settings are updated */
export function invalidateLockedPagesCache() {
  cachedLockedData = null
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
    : routeOrRole as 'superadmin' | 'tenant_admin' | 'judge' | 'user'

  const staticAllowed = gate.user && (() => {
    if (requiredRole === 'user') return true
    if (requiredRole === 'superadmin') return isSuperAdmin(gate.user.role)
    if (requiredRole === 'tenant_admin') return isAdmin(gate.user.role)
    if (requiredRole === 'judge') return isJudge(gate.user.role) || isAdmin(gate.user.role)
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

/**
 * Check whether a specific sub-page feature is locked (e.g. "scanner:github").
 * Superadmins bypass all feature locks.
 */
export function useFeatureLock(featureId: string) {
  const gate = useRoleGate({ require: 'auth' })
  const [lockedFeatures, setLockedFeatures] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchLockedFeatures().then(features => {
      if (!cancelled) {
        setLockedFeatures(features)
        setLoaded(true)
      }
    })
    return () => { cancelled = true }
  }, [])

  const locked = loaded && gate.ready
    && !isSuperAdmin(gate.user?.role ?? 'user')
    && lockedFeatures.includes(featureId)

  return { locked, loaded }
}

/**
 * Returns the full list of locked feature IDs (for multi-check in a single page).
 * Superadmins get an empty list (bypass).
 */
export function useLockedFeatures(): { lockedFeatures: string[]; loaded: boolean } {
  const gate = useRoleGate({ require: 'auth' })
  const [features, setFeatures] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchLockedFeatures().then(f => {
      if (!cancelled) {
        setFeatures(f)
        setLoaded(true)
      }
    })
    return () => { cancelled = true }
  }, [])

  const isSuper = gate.ready && isSuperAdmin(gate.user?.role ?? 'user')

  return {
    lockedFeatures: loaded && !isSuper ? features : [],
    loaded,
  }
}
