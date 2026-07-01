'use client'

import { useRoleGate } from '@/lib/use-role-gate'
import { getRequiredRoleForRoute } from '@/lib/page-permissions'

export function usePageGuard(
  routeOrRole: string | ('superadmin' | 'tenant_admin' | 'user') = 'user'
) {
  const requiredRole = typeof routeOrRole === 'string' && routeOrRole.startsWith('/')
    ? getRequiredRoleForRoute(routeOrRole)
    : routeOrRole as 'superadmin' | 'tenant_admin' | 'user'

  const roleMap: Record<string, 'auth' | 'admin' | 'superadmin'> = {
    user: 'auth',
    tenant_admin: 'admin',
    superadmin: 'superadmin',
  }
  return useRoleGate({ require: roleMap[requiredRole] || 'auth' })
}
