'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import {
  getDefaultDashboard,
  isSuperAdmin,
  isAdmin,
  type UserRole,
} from '@/lib/rbac'

interface RoleGate {
  ready: boolean
  allowed: boolean
  user: { id: string; email: string; name?: string; role: UserRole } | null
  loading: boolean
}

/** Cache permission checks per session to avoid excessive API calls */
let _permCheckCache: { role: string; allowedRoutes: string[]; expiry: number } | null = null

async function fetchAllowedRoutes(role: string): Promise<string[]> {
  const now = Date.now()
  if (_permCheckCache && _permCheckCache.role === role && _permCheckCache.expiry > now) {
    return _permCheckCache.allowedRoutes
  }
  try {
    const res = await fetch('/api/admin/permissions/roles', { credentials: 'include' })
    if (!res.ok) return []
    const data = await res.json()
    const roleData = data.roles?.find((r: any) => r.role === role)
    const perms = roleData?.permissions || []
    const routes = perms
      .filter((p: any) => p.resourceType === 'page' || !p.resource.startsWith('entity:'))
      .filter((p: any) => p.actions?.includes('read') || p.actions?.includes('manage'))
      .map((p: any) => p.resource)
    _permCheckCache = { role, allowedRoutes: routes, expiry: now + 30_000 }
    return routes
  } catch {
    return []
  }
}

export function useRoleGate(opts: { require?: 'auth' | 'admin' | 'superadmin' } = {}): RoleGate {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [ready, setReady] = useState(false)
  const [userRole, setUserRole] = useState<UserRole | null>(null)

  useEffect(() => {
    if (loading) return
    if (!user) { router.push('/auth/login'); return }
    let cancelled = false
    fetch('/api/auth/session', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(async data => {
        if (cancelled) return
        const role = (data?.user?.role || 'user') as UserRole
        setUserRole(role)
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) { setUserRole('user'); setReady(true) }
      })
    return () => { cancelled = true }
  }, [loading, user, router])

  const profile = user && userRole ? {
    id: user.uid, email: user.email || '', name: user.displayName || undefined, role: userRole,
  } : null

  const allowed = ready && (() => {
    if (!opts.require || opts.require === 'auth') return true
    // Fallback to role-based check (DB permissions add granularity but never restrict role access)
    if (opts.require === 'superadmin') return isSuperAdmin(userRole!)
    if (opts.require === 'admin') return isAdmin(userRole!)
    return false
  })()

  return { ready, allowed, user: profile, loading }
}
