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

export interface AuthUser {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  sessionExpired: boolean
  clearSessionExpired: () => void
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string, name: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signInWithGithub: () => Promise<void>
  signOut: () => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  confirmPasswordReset: (code: string, newPassword: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function toAuthUser(u: { uid: string; email: string | null; displayName?: string | null; photoURL?: string | null }): AuthUser {
  return { uid: u.uid, email: u.email, displayName: u.displayName || null, photoURL: u.photoURL || null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)
  const clearSessionExpired = () => setSessionExpired(false)

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
              await fetch('/api/auth/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken }),
              })
            } catch { /* non-critical */ }
          } else {
            // Firebase signed out — check if session cookie is still valid
            try {
              const res = await fetch('/api/auth/session', { credentials: 'include' })
              const data = await res.json()
              if (!data?.user) {
                setUser(null)
                setSessionExpired(true)
              }
            } catch { setUser(null) }
          }
          if (!cancelled) setLoading(false)
        })
        return () => { unsub() }
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

  // Session heartbeat — keep the server session alive every 10 minutes
  useEffect(() => {
    if (loading || !user) return
    const interval = setInterval(async () => {
      try {
        const a = getFirebaseAuth()
        if (!a?.currentUser) return
        const idToken = await a.currentUser.getIdToken(true) // force refresh
        await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        })
      } catch { /* heartbeat failed — will retry next interval */ }
    }, 10 * 60 * 1000) // every 10 minutes
    return () => clearInterval(interval)
  }, [loading, user])

  const signInWithEmailFn = async (email: string, password: string) => {
    setSessionExpired(false)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Login failed')
    setUser(toAuthUser({ uid: json.user.id, email: json.user.email, displayName: json.user.name }))
  }

  const signUpWithEmailFn = async (email: string, password: string, name: string) => {
    const res = await fetch('/api/auth/signup', {
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
    setUser(toAuthUser(cred.user))
  }

  const signInWithGithubFn = async () => {
    const auth = getAuth()
    const provider = new GithubAuthProvider()
    provider.addScope('user:email')
    const cred = await signInWithPopup(auth, provider)
    setUser(toAuthUser(cred.user))
  }

  const signOutFn = async () => {
    try { await firebaseSignOut(getAuth()) } catch {}
    await fetch('/api/auth/session', { method: 'DELETE' })
    setUser(null)
    setSessionExpired(false)
  }

  const sendPasswordResetFn = async (email: string) => {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to send reset email')
  }

  const confirmPasswordResetFn = async (code: string, newPassword: string) => {
    const res = await fetch('/api/auth/reset-password', {
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
