'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useRoleGate } from '@/lib/use-role-gate'
import { isSuperAdmin } from '@/lib/rbac'
import { decideRouteAccess, resolveRouteAccess, roleMeets, type AccessRole } from '@/lib/page-access-map'

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

/** The caller's page grants/revokes (/api/user/my-permissions), shared across hooks. */
type PagePerm = { resource: string; actions: string[] }
let cachedPerms: { key: string; perms: PagePerm[] } | null = null
let permsPromise: { key: string; p: Promise<PagePerm[]> } | null = null

export function fetchMyPagePermissions(key: string): Promise<PagePerm[]> {
  if (cachedPerms?.key === key) return Promise.resolve(cachedPerms.perms)
  if (permsPromise?.key === key) return permsPromise.p
  const p = fetch('/api/user/my-permissions', { credentials: 'include' })
    .then(r => r.ok ? r.json() : null)
    .then((data: { readable?: unknown; denied?: unknown } | null) => {
      const list = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
      const perms: PagePerm[] = [
        ...list(data?.readable).map(resource => ({ resource, actions: ['read'] })),
        ...list(data?.denied).map(resource => ({ resource, actions: [] as string[] })),
      ]
      cachedPerms = { key, perms }
      return perms
    })
    .catch(() => { permsPromise = null; return [] as PagePerm[] })
  permsPromise = { key, p }
  return p
}

/**
 * Client page guard (UX only — proxy.ts enforces the same rule on the server).
 * Reads the one route → access map (lib/page-access-map.ts) for the current
 * page; the argument is only used for paths the map does not cover.
 */
export function usePageGuard(
  routeOrRole: string | ('superadmin' | 'tenant_admin' | 'judge' | 'user') = 'user'
) {
  const gate = useRoleGate({ require: 'auth' })
  const pathname = usePathname()
  const router = useRouter()
  const [perms, setPerms] = useState<PagePerm[] | null>(null)
  const [lockedPages, setLockedPages] = useState<string[]>(() => cachedLockedData?.locked_pages ?? [])
  const [locksLoaded, setLocksLoaded] = useState(() => cachedLockedData !== null)

  const target = typeof routeOrRole === 'string' && routeOrRole.startsWith('/') ? routeOrRole : pathname
  const mapped = resolveRouteAccess(target) !== null
  const fallbackRole = (routeOrRole.startsWith('/') ? 'user' : routeOrRole) as AccessRole
  const role = gate.user?.role ?? null

  const decide = (permissions?: PagePerm[]) => {
    if (!role) return { ok: false as const, reason: 'unauthenticated' as const }
    if (!mapped) {
      const ok = isSuperAdmin(role) || roleMeets(role, fallbackRole)
      return ok ? { ok: true as const } : { ok: false as const, reason: 'forbidden' as const }
    }
    // The session's role is already effective (a tenant-less tenant admin is
    // demoted server-side), so a tenant admin here belongs to an organisation.
    return decideRouteAccess({
      pathname: target,
      user: { role, tenantId: role === 'tenant_admin' ? 'session' : null },
      lockedPages,
      permissions,
    })
  }

  const first = gate.ready && locksLoaded ? decide() : null
  const needsGrants = !!first && !first.ok && first.reason === 'forbidden' && mapped && !!role && !isSuperAdmin(role)

  // Only when the static rule says no: a role grant may still open the page.
  useEffect(() => {
    if (!needsGrants || !role) return
    let cancelled = false
    fetchMyPagePermissions(role).then(p => { if (!cancelled) setPerms(p) })
    return () => { cancelled = true }
  }, [needsGrants, role])

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

  const final = needsGrants ? (perms ? decide(perms) : null) : first
  const decided = final !== null
  const allowed = Boolean(final?.ok)
  const locked = !!final && !final.ok && final.reason === 'locked'

  useEffect(() => {
    if (!decided || allowed) return
    router.replace('/dashboard')
  }, [decided, allowed, router])

  return {
    ready: allowed,
    allowed,
    locked,
    user: gate.user,
    loading: !decided || !allowed,
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
