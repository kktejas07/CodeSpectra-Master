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
  const { user, loading: authLoading } = useAuth()
  const [ready, setReady] = useState(false)
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [sessionUser, setSessionUser] = useState<{ id: string; email: string; role: UserRole } | null>(null)

  useEffect(() => {
    // Check session API first — this uses the server-side cookie
    // which is more reliable than Firebase's client-side state
    let cancelled = false
    fetch('/api/auth/session', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return
        if (data?.user) {
          const role = (data.user.role || 'user') as UserRole
          setUserRole(role)
          setSessionUser({
            id: data.user.uid,
            email: data.user.email || '',
            role,
          })
          setReady(true)
        }
        // Don't redirect immediately — wait for Firebase to possibly catch up
      })
      .catch(() => { /* retry below */ })
    return () => { cancelled = true }
  }, [])

  // If Firebase eventually loads, sync with session
  useEffect(() => {
    if (authLoading) return
    if (user && sessionUser) {
      // Both Firebase and session agree — user is logged in
      // sessionUser already set, no change needed
    } else if (!user && !sessionUser && !authLoading && !ready) {
      // Both failed — redirect to login
      const loginUrl = new URL('/auth/login', window.location.origin)
      loginUrl.searchParams.set('redirectTo', window.location.pathname)
      router.replace(loginUrl.toString())
    } else if (!sessionUser && !authLoading && !ready) {
      // Retry session check after a short delay (Firebase may need time)
      const timer = setTimeout(() => {
        fetch('/api/auth/session', { credentials: 'include' })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data?.user) {
              const role = (data.user.role || 'user') as UserRole
              setUserRole(role)
              setSessionUser({ id: data.user.uid, email: data.user.email || '', role })
              setReady(true)
            } else {
              const loginUrl = new URL('/auth/login', window.location.origin)
              loginUrl.searchParams.set('redirectTo', window.location.pathname)
              router.replace(loginUrl.toString())
            }
          })
          .catch(() => {
            const loginUrl = new URL('/auth/login', window.location.origin)
            loginUrl.searchParams.set('redirectTo', window.location.pathname)
            router.replace(loginUrl.toString())
          })
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [authLoading, user, sessionUser, ready, router])

  const profile = (user || sessionUser) && userRole ? {
    id: sessionUser?.id || user?.uid || '',
    email: sessionUser?.email || user?.email || '',
    name: user?.displayName || undefined,
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
