/**
 * Pure page / feature access rules shared by the client guard
 * (lib/use-page-guard.ts) and the server helper `requirePageAccess`
 * (lib/route-auth.ts). Deny by default; superadmin bypasses locks.
 */
import { checkResourcePermission, type ResourcePermission } from '@/lib/permissions-db'

/** `route` equals `base` or sits under it as a path segment (`/a` covers `/a/b`, not `/ab`). */
export function routeCovers(base: string, route: string): boolean {
  if (!base || !route) return false
  const b = base.replace(/\/+$/, '')
  const r = route.split('?')[0].replace(/\/+$/, '')
  return r === b || r.startsWith(b + '/')
}

export function isRouteLocked(route: string, lockedPages: readonly string[]): boolean {
  return lockedPages.some((p) => typeof p === 'string' && routeCovers(p, route))
}

export function isFeatureLocked(featureId: string, lockedFeatures: readonly string[]): boolean {
  return !!featureId && lockedFeatures.includes(featureId)
}

export type PageAccessDecision = { ok: true } | { ok: false; reason: 'locked' | 'forbidden' }

/**
 * Decide whether `role` may use `route` (and optional sub-feature):
 * superadmin always; everyone else needs the page unlocked, the feature
 * unlocked, and a read/manage page permission (stored merged with defaults).
 */
export function decidePageAccess(input: {
  role: string | null | undefined
  route: string
  feature?: string
  lockedPages: readonly string[]
  lockedFeatures: readonly string[]
  permissions: ResourcePermission[]
}): PageAccessDecision {
  const { role, route, feature, lockedPages, lockedFeatures, permissions } = input
  if (!role) return { ok: false, reason: 'forbidden' }
  if (role === 'superadmin') return { ok: true }
  if (isRouteLocked(route, lockedPages)) return { ok: false, reason: 'locked' }
  if (feature && isFeatureLocked(feature, lockedFeatures)) return { ok: false, reason: 'locked' }
  if (!checkResourcePermission(permissions, route, 'read')) return { ok: false, reason: 'forbidden' }
  return { ok: true }
}
