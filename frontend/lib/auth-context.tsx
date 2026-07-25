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

export interface AuthUser {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  lastLoginMethod?: 'google' | 'github' | 'email' | 'sso' | null
  lastLoginAt?: string | null
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

function setLastLogin(method: LastLoginInfo['method']) {
  if (typeof window === 'undefined') return
  localStorage.setItem(LAST_LOGIN_KEY, JSON.stringify({ method, at: new Date().toISOString() }))
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  sessionExpired: boolean
  clearSessionExpired: () => void
  signInWithEmail: (email: string, password: string, totpToken?: string) => Promise<void>
  signUpWithEmail: (email: string, password: string, name: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signInWithGithub: () => Promise<void>
  signOut: () => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  confirmPasswordReset: (code: string, newPassword: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function toAuthUser(u: { uid: string; email: string | null; displayName?: string | null; photoURL?: string | null; lastLoginMethod?: string | null; lastLoginAt?: string | null }): AuthUser {
  return { uid: u.uid, email: u.email, displayName: u.displayName || null, photoURL: u.photoURL || null, lastLoginMethod: u.lastLoginMethod as AuthUser['lastLoginMethod'], lastLoginAt: u.lastLoginAt || null }
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
          }))
          setLoading(false)
        }
      })
      .catch(() => {})
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
          if (fbUser) {
            setUser(toAuthUser(fbUser))
            try {
              const idToken = await fbUser.getIdToken()
              await csrfFetch('/api/auth/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken }),
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
      try {
        const a = getFirebaseAuth()
        if (!a?.currentUser) return
        const idToken = await a.currentUser.getIdToken(true)
        await csrfFetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        })
      } catch { /* heartbeat failed — will retry next interval */ }
    }, 5 * 60 * 1000) // every 5 minutes
    return () => clearInterval(interval)
  }, [loading, user])

  const signInWithEmailFn = async (email: string, password: string, totpToken?: string) => {
    setSessionExpired(false)
    const body: Record<string, string> = { email, password }
    if (totpToken) body.totpToken = totpToken
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
  }

  const signUpWithEmailFn = async (email: string, password: string, name: string) => {
    const res = await csrfFetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Signup failed')
    setUser(toAuthUser({ uid: json.user.id, email: json.user.email, displayName: json.user.name }))
  }

  const signInWithGoogleFn = async () => {
    const auth = getAuth()
    const provider = new GoogleAuthProvider()
    provider.addScope('email'); provider.addScope('profile')
    const cred = await signInWithPopup(auth, provider)
    setLastLogin('google')
    setUser(toAuthUser(cred.user))
    await recordLoginMethod(cred.user.uid, 'google')
  }

  const signInWithGithubFn = async () => {
    const auth = getAuth()
    const provider = new GithubAuthProvider()
    provider.addScope('user:email')
    const cred = await signInWithPopup(auth, provider)
    setLastLogin('github')
    setUser(toAuthUser(cred.user))
    await recordLoginMethod(cred.user.uid, 'github')
  }

  const signOutFn = async () => {
    try { await firebaseSignOut(getAuth()) } catch {}
    await csrfFetch('/api/auth/session', { method: 'DELETE' })
    setUser(null)
    setSessionExpired(false)
  }

  const sendPasswordResetFn = async (email: string) => {
    const res = await csrfFetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
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
