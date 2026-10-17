'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup,
  getAuth,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { getFirebaseAuth, prefetchFirebaseConfig, setFirebaseConfig } from './firebase'
import { csrfFetch } from './csrf-fetch'
import { getVisitorId, withFingerprint } from './fingerprint'

export interface AuthUser {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  lastLoginMethod?: 'google' | 'github' | 'email' | 'sso' | null
  lastLoginAt?: string | null
  createdAt?: string | null
  has_enrolled_face?: boolean
  onboardingGoal?: string | null
}

interface LastLoginInfo {
  method: 'email' | 'google' | 'github'
  at: string // ISO timestamp
}

const LAST_LOGIN_KEY = 'cs_last_login'

export function getLastLogin(): LastLoginInfo | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LAST_LOGIN_KEY)
    return raw ? (JSON.parse(raw) as LastLoginInfo) : null
  } catch { return null }
}

/**
 * True while a superadmin is viewing the app as another user
 * (impersonation). While active we must NOT re-sync the Firebase session
 * cookie, otherwise the admin's own idToken would overwrite the
 * impersonated session.
 */
function isImpersonating(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.split('; ').some((c) => c.startsWith('codespectra_impersonating=1'))
}

function setLastLogin(method: LastLoginInfo['method']) {
  if (typeof window === 'undefined') return
  localStorage.setItem(LAST_LOGIN_KEY, JSON.stringify({ method, at: new Date().toISOString() }))
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  sessionExpired: boolean
  clearSessionExpired: () => void
  signInWithEmail: (email: string, password: string, totpToken?: string, turnstileToken?: string) => Promise<void>
  signUpWithEmail: (email: string, password: string, name: string, extendedProfileData?: Record<string, string>, turnstileToken?: string, opts?: { inviteToken?: string }) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signInWithGithub: () => Promise<void>
  signOut: () => Promise<void>
  sendPasswordReset: (email: string, turnstileToken?: string) => Promise<void>
  confirmPasswordReset: (code: string, newPassword: string) => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function toAuthUser(u: { uid: string; email: string | null; displayName?: string | null; photoURL?: string | null; lastLoginMethod?: string | null; lastLoginAt?: string | null; createdAt?: string | null; onboardingGoal?: string | null; has_enrolled_face?: boolean }): AuthUser {
  return { uid: u.uid, email: u.email, displayName: u.displayName || null, photoURL: u.photoURL || null, lastLoginMethod: u.lastLoginMethod as AuthUser['lastLoginMethod'], lastLoginAt: u.lastLoginAt || null, createdAt: u.createdAt || null, onboardingGoal: u.onboardingGoal || null, ...(typeof u.has_enrolled_face === 'boolean' ? { has_enrolled_face: u.has_enrolled_face } : {}) }
}

async function recordLoginMethod(uid: string, method: 'google' | 'github' | 'email' | 'sso') {
  try {
    await csrfFetch('/api/auth/login-method', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, method }),
    })
  } catch { /* non-critical */ }
}

/** Best-effort sync of this device's fingerprint to the server for admin visibility. */
async function reportFingerprint(uid: string) {
  try {
    const visitorId = await getVisitorId()
    if (!visitorId) return
    await csrfFetch('/api/security/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId, uid }),
    })
  } catch { /* non-critical */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)
  const clearSessionExpired = () => setSessionExpired(false)

  // Immediate session check — don't wait for Firebase
  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.user) {
          setUser(toAuthUser({
            uid: data.user.uid,
            email: data.user.email,
            displayName: data.user.fullName,
            lastLoginMethod: data.user.lastLoginMethod,
            lastLoginAt: data.user.lastLoginAt,
            createdAt: data.user.createdAt,
            onboardingGoal: data.user.onboardingGoal,
            has_enrolled_face: data.user.has_enrolled_face,
          }))
        }
        setLoading(false)
      })
      .catch(() => { setLoading(false) })
  }, [])

  // Sync Firebase token → session cookie (silent refresh)
  useEffect(() => {
    let unsub: (() => void) | null = null
    let cancelled = false

    const init = async () => {
      try {
        const cfg = await prefetchFirebaseConfig()
        if (cfg) setFirebaseConfig(cfg)
        const a = getFirebaseAuth()
        if (!a) { if (!cancelled) setLoading(false); return }

        // Listen for token changes (fires on every token refresh — keeps session alive)
        unsub = a.onIdTokenChanged(async (fbUser) => {
          if (cancelled) return
          // While impersonating, never overwrite the impersonated session
          // with the admin's Firebase idToken.
          if (isImpersonating()) {
            try {
              const res = await fetch('/api/auth/session', { credentials: 'include' })
              const data = await res.json()
              if (data?.user) {
                setUser(toAuthUser({
                  uid: data.user.uid,
                  email: data.user.email,
                  displayName: data.user.fullName,
                  lastLoginMethod: data.user.lastLoginMethod,
                  lastLoginAt: data.user.lastLoginAt,
                  createdAt: data.user.createdAt,
                  onboardingGoal: data.user.onboardingGoal,
            has_enrolled_face: data.user.has_enrolled_face,
                }))
              }
            } catch { /* keep current user */ }
            if (!cancelled) setLoading(false)
            return
          }
          if (fbUser) {
            setUser(toAuthUser(fbUser))
            try {
              const idToken = await fbUser.getIdToken()
              const body: Record<string, string> = { idToken }
              await withFingerprint(body)
              await csrfFetch('/api/auth/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              })
            } catch { /* non-critical */ }
          } else {
            // Firebase not available yet — use session cookie as fallback
            try {
              const res = await fetch('/api/auth/session', { credentials: 'include' })
              const data = await res.json()
              if (data?.user) {
                setUser(toAuthUser({
                  uid: data.user.uid,
                  email: data.user.email,
                  displayName: data.user.fullName,
                  lastLoginMethod: data.user.lastLoginMethod,
                  lastLoginAt: data.user.lastLoginAt,
                  createdAt: data.user.createdAt,
                  onboardingGoal: data.user.onboardingGoal,
            has_enrolled_face: data.user.has_enrolled_face,
                }))
              } else {
                setUser(null)
                setSessionExpired(true)
              }
            } catch { setUser(null) }
          }
          if (!cancelled) setLoading(false)
        })
        return () => { unsub?.() }
      } catch (e) {
        console.warn('[Auth] Init error:', e)
        if (!cancelled) setLoading(false)
      }
    }
    init()
    return () => {
      cancelled = true
      unsub?.()
    }
  }, [])

  // Session heartbeat — keep the server session alive every 5 minutes
  useEffect(() => {
    if (loading || !user) return
    const interval = setInterval(async () => {
      if (isImpersonating()) return
      try {
        const a = getFirebaseAuth()
        if (!a?.currentUser) return
        const idToken = await a.currentUser.getIdToken(true)
        const body: Record<string, string> = { idToken }
        await withFingerprint(body)
        await csrfFetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } catch { /* heartbeat failed — will retry next interval */ }
    }, 5 * 60 * 1000) // every 5 minutes
    return () => clearInterval(interval)
  }, [loading, user])

  const signInWithEmailFn = async (email: string, password: string, totpToken?: string, turnstileToken?: string) => {
    setSessionExpired(false)
    const body: Record<string, string> = { email, password }
    if (totpToken) body.totpToken = totpToken
    if (turnstileToken) body.turnstileToken = turnstileToken
    await withFingerprint(body)
    const res = await csrfFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (json.twoFactorRequired) {
      throw { twoFactorRequired: true, message: 'Two-factor code required' }
    }
    if (!res.ok) throw new Error(json.error || 'Login failed')
    const authUser = toAuthUser({ uid: json.user.id, email: json.user.email, displayName: json.user.name })
    setUser(authUser)
    setLastLogin('email')
    await recordLoginMethod(json.user.id, 'email')
    await reportFingerprint(json.user.id)
  }

  const signUpWithEmailFn = async (email: string, password: string, name: string, extendedProfileData?: Record<string, string>, turnstileToken?: string, opts?: { inviteToken?: string }) => {
    const body: Record<string, string> = { email, password, name, ...(extendedProfileData || {}) }
    if (turnstileToken) body.turnstileToken = turnstileToken
    if (opts?.inviteToken) body.inviteToken = opts.inviteToken
    await withFingerprint(body)
    const res = await csrfFetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Signup failed')
    setUser(toAuthUser({ uid: json.user.id, email: json.user.email, displayName: json.user.name }))
    await reportFingerprint(json.user.id)
  }

  const signInWithGoogleFn = async () => {
    const auth = getAuth()
    const provider = new GoogleAuthProvider()
    provider.addScope('email'); provider.addScope('profile')
    const cred = await signInWithPopup(auth, provider)
    setLastLogin('google')
    setUser(toAuthUser(cred.user))
    await recordLoginMethod(cred.user.uid, 'google')
    await reportFingerprint(cred.user.uid)
  }

  const signInWithGithubFn = async () => {
    const auth = getAuth()
    const provider = new GithubAuthProvider()
    provider.addScope('user:email')
    const cred = await signInWithPopup(auth, provider)
    setLastLogin('github')
    setUser(toAuthUser(cred.user))
    await recordLoginMethod(cred.user.uid, 'github')
    await reportFingerprint(cred.user.uid)
  }

  const signOutFn = async () => {
    try { await firebaseSignOut(getAuth()) } catch {}
    await csrfFetch('/api/auth/session', { method: 'DELETE' })
    setUser(null)
    setSessionExpired(false)
  }

  const sendPasswordResetFn = async (email: string, turnstileToken?: string) => {
    const body: Record<string, string> = { email }
    if (turnstileToken) body.turnstileToken = turnstileToken
    const res = await csrfFetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to send reset email')
  }

  const confirmPasswordResetFn = async (code: string, newPassword: string) => {
    const res = await csrfFetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, newPassword }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to reset password')
  }

  const refreshUserFn = async () => {
    try {
      const res = await fetch('/api/auth/session', { credentials: 'include' })
      const data = await res.json()
      if (data?.user) {
        setUser(toAuthUser({
          uid: data.user.uid,
          email: data.user.email,
          displayName: data.user.fullName,
          lastLoginMethod: data.user.lastLoginMethod,
          lastLoginAt: data.user.lastLoginAt,
          createdAt: data.user.createdAt,
          onboardingGoal: data.user.onboardingGoal,
            has_enrolled_face: data.user.has_enrolled_face,
        }))
      }
    } catch { /* ignore */ }
  }

  return (
    <AuthContext.Provider value={{
      user, loading, sessionExpired, clearSessionExpired,
      signInWithEmail: signInWithEmailFn,
      signUpWithEmail: signUpWithEmailFn,
      signInWithGoogle: signInWithGoogleFn,
      signInWithGithub: signInWithGithubFn,
      signOut: signOutFn,
      sendPasswordReset: sendPasswordResetFn,
      confirmPasswordReset: confirmPasswordResetFn,
      refreshUser: refreshUserFn,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
