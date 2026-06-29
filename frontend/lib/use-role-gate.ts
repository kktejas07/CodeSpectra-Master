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

export function useRoleGate(opts: { require?: 'auth' | 'admin' | 'superadmin' } = {}): RoleGate {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [ready, setReady] = useState(false)
  const [userRole, setUserRole] = useState<UserRole | null>(null)

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.push('/auth/login')
      return
    }
    let cancelled = false
    fetch('/api/auth/session', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return
        const role = (data?.user?.role || 'user') as UserRole
        setUserRole(role)
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) {
          setUserRole('user')
          setReady(true)
        }
      })
    return () => { cancelled = true }
  }, [loading, user, router])

  const profile = user && userRole
    ? {
        id: user.uid,
        email: user.email || '',
        name: user.displayName || undefined,
        role: userRole,
      }
    : null

  const allowed = ready && (() => {
    if (!opts.require || opts.require === 'auth') return true
    if (opts.require === 'superadmin') return isSuperAdmin(userRole!)
    if (opts.require === 'admin') return isAdmin(userRole!)
    return false
  })()

  return { ready, allowed, user: profile, loading }
}
