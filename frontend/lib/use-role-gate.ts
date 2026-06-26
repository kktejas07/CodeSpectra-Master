'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/auth-client'
import {
  normalizeUserRole,
  isSuperAdmin,
  isAdmin as isAdminLike,
  getDefaultDashboard,
  type UserRole,
} from '@/lib/rbac'

interface RoleGate {
  ready: boolean
  allowed: boolean
  user: { id: string; email: string; name?: string; role: UserRole } | null
  loading: boolean
}

/**
 * Client-side role gate using Better Auth. Redirects to /auth/login if the
 * user is unauthenticated, or to their default dashboard if the role doesn't
 * match.
 */
export function useRoleGate(opts: { require?: 'auth' | 'admin' | 'superadmin' } = {}): RoleGate {
  const router = useRouter()
  const { data: session, isPending } = useSession()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (isPending) return
    if (!session?.user) {
      router.push('/auth/login')
      return
    }
    const role = normalizeUserRole(
      (session.user as { role?: string }).role,
    )
    if (opts.require === 'superadmin' && !isSuperAdmin(role)) {
      router.push(getDefaultDashboard(role))
      return
    }
    if (opts.require === 'admin' && !isAdminLike(role)) {
      router.push(getDefaultDashboard(role))
      return
    }
    setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, session?.user?.id, opts.require])

  const user = session?.user
    ? {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: normalizeUserRole((session.user as { role?: string }).role),
      }
    : null

  return { ready, allowed: ready, user, loading: isPending }
}
