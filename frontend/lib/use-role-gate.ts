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
  const [ready, setReady] = useState(false)
  const [userRole, setUserRole] = useState<UserRole | null>(null)

  useEffect(() => {
    let cancelled = false
    let attempts = 0
    let maxAttempts = 30 // ~60 seconds total

    const trySession = () => {
      if (cancelled) return
      fetch('/api/auth/session', { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (cancelled) return
          if (data?.user) {
            setUserRole((data.user.role || 'user') as UserRole)
            setReady(true)
            return
          }
          // Retry with backoff
          attempts++
          if (attempts < maxAttempts) {
            setTimeout(trySession, Math.min(2000 + attempts * 500, 10000))
          } else {
            // After ~60s, give up silently — user sees "Loading..." but stays on page
            setReady(true)
            setUserRole('user')
          }
        })
        .catch(() => {
          if (cancelled) return
          attempts++
          if (attempts < maxAttempts) {
            setTimeout(trySession, 3000)
          } else {
            setReady(true)
            setUserRole('user')
          }
        })
    }

    trySession()
    return () => { cancelled = true }
  }, [])

  const profile = fbUser && userRole ? {
    id: fbUser.uid,
    email: fbUser.email || '',
    name: fbUser.displayName || undefined,
    role: userRole,
  } : null

  const allowed = ready && (() => {
    if (!opts.require || opts.require === 'auth') return true
    if (opts.require === 'superadmin') return isSuperAdmin(userRole!)
    if (opts.require === 'admin') return isAdmin(userRole!)
    return false
  })()

  return { ready, allowed, user: profile, loading: !ready }
}
