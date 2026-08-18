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
  const { user: fbUser, loading: fbLoading } = useAuth()
  const [ready, setReady] = useState(process.env.NODE_ENV === 'development')
  const [userRole, setUserRole] = useState<UserRole | null>(process.env.NODE_ENV === 'development' ? 'superadmin' : null)

  useEffect(() => {
    let cancelled = false

    const trySession = async () => {
      if (cancelled) return
      try {
        const r = await fetch('/api/auth/session', { credentials: 'include' })
        if (cancelled) return
        if (r.ok) {
          const data = await r.json()
          if (data?.user) {
            setUserRole((data.user.role || 'user') as UserRole)
            setReady(true)
            return
          }
        }
      } catch {}
      if (!cancelled) {
        setReady(true)
        setUserRole('user')
      }
    }

    trySession()
    return () => { cancelled = true }
  }, [])

  const devMockUser = process.env.NODE_ENV === 'development' ? {
    id: 'dev-superadmin-01',
    email: 'admin@codespectra.ai',
    name: 'Super Admin (Dev)',
    role: 'superadmin' as UserRole,
  } : null

  const profile = (fbUser && userRole ? {
    id: fbUser.uid,
    email: fbUser.email || '',
    name: fbUser.displayName || undefined,
    role: userRole,
  } : null) || devMockUser

  const allowed = ready && (() => {
    if (!opts.require || opts.require === 'auth') return true
    if (opts.require === 'superadmin') return isSuperAdmin(userRole!)
    if (opts.require === 'admin') return isAdmin(userRole!)
    return false
  })()

  return { ready, allowed, user: profile, loading: !ready }
}
