'use client'

import { useEffect, useState } from 'react'
import { useRoleGate } from '@/lib/use-role-gate'
import { getRequiredRoleForRoute } from '@/lib/page-permissions'
import { isSuperAdmin, isAdmin, type UserRole } from '@/lib/rbac'

export function usePageGuard(
  routeOrRole: string | ('superadmin' | 'tenant_admin' | 'user') = 'user'
) {
  const gate = useRoleGate({ require: 'auth' })
  const [dbAllowed, setDbAllowed] = useState<boolean | null>(null)

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

  const allowed = gate.ready && (staticAllowed || dbAllowed === true)
  const loading = !gate.ready || (staticAllowed === false && dbAllowed === null)

  return {
    ready: gate.ready && (staticAllowed || dbAllowed !== null),
    allowed,
    user: gate.user,
    loading,
  }
}
