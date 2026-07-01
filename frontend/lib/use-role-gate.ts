'use client'

import { useEffect, useState, useRef } from 'react'
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
  const triedRef = useRef(false)

  useEffect(() => {
    if (triedRef.current) return
    triedRef.current = true

    let cancelled = false

    // Try session cookie first (works immediately)
    fetch('/api/auth/session', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return
        if (data?.user) {
          setUserRole((data.user.role || 'user') as UserRole)
          setReady(true)
          return
        }
        // Session failed — wait for Firebase to catch up (up to 3 seconds)
        let attempts = 0
        const check = setInterval(() => {
          attempts++
          if (cancelled) { clearInterval(check); return }
          // Re-check session (Firebase may have synced by now)
          fetch('/api/auth/session', { credentials: 'include' })
            .then(r => r.ok ? r.json() : null)
            .then(retryData => {
              if (cancelled) return
              if (retryData?.user) {
                clearInterval(check)
                setUserRole((retryData.user.role || 'user') as UserRole)
                setReady(true)
              } else if (attempts >= 5) {
                clearInterval(check)
                // Final attempt failed — redirect to login
                const loginUrl = new URL('/auth/login', window.location.origin)
                loginUrl.searchParams.set('redirectTo', window.location.pathname)
                router.replace(loginUrl.toString())
              }
            })
        }, 800)
        return () => clearInterval(check)
      })
      .catch(() => {
        if (!cancelled) {
          const loginUrl = new URL('/auth/login', window.location.origin)
          loginUrl.searchParams.set('redirectTo', window.location.pathname)
          router.replace(loginUrl.toString())
        }
      })

    return () => { cancelled = true }
  }, [router])

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
