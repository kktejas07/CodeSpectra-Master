'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  GithubAuthProvider,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { getFirebaseAuth, prefetchFirebaseConfig, setFirebaseConfig } from './firebase'
import type { User } from 'firebase/auth'

export interface AuthUser {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
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

function getAuth() {
  const a = getFirebaseAuth()
  if (!a) throw new Error('Firebase not available')
  return a
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let unsubscribe: (() => void) | null = null
    let cancelled = false
    const init = async () => {
      try {
        const cfg = await prefetchFirebaseConfig()
        if (cfg) setFirebaseConfig(cfg)
        const a = getFirebaseAuth()
        if (!a) {
          if (!cancelled) { setLoading(false); return }
          return
        }
        unsubscribe = onAuthStateChanged(a, async (firebaseUser) => {
          if (cancelled) return
          if (firebaseUser) {
            setUser(toAuthUser({ uid: firebaseUser.uid, email: firebaseUser.email, displayName: firebaseUser.displayName, photoURL: firebaseUser.photoURL }))
            try {
              const idToken = await firebaseUser.getIdToken()
              await fetch('/api/auth/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken }),
              })
            } catch { /* session sync is optional */ }
          } else {
            setUser(null)
            try { await fetch('/api/auth/session', { method: 'DELETE' }) } catch {}
          }
          if (!cancelled) setLoading(false)
        })
      } catch (e) {
        console.warn('[Auth] Init error:', e)
        if (!cancelled) setLoading(false)
      }
    }
    init()
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  const signInWithEmailFn = async (email: string, password: string) => {
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
    provider.addScope('email')
    provider.addScope('profile')
    const cred = await signInWithPopup(auth, provider)
    setUser(toAuthUser({ uid: cred.user.uid, email: cred.user.email, displayName: cred.user.displayName, photoURL: cred.user.photoURL }))
  }

  const signInWithGithubFn = async () => {
    const auth = getAuth()
    const provider = new GithubAuthProvider()
    provider.addScope('user:email')
    const cred = await signInWithPopup(auth, provider)
    setUser(toAuthUser({ uid: cred.user.uid, email: cred.user.email, displayName: cred.user.displayName, photoURL: cred.user.photoURL }))
  }

  const signOutFn = async () => {
    try { await firebaseSignOut(getAuth()) } catch { /* ignore if Firebase not configured */ }
    await fetch('/api/auth/session', { method: 'DELETE' })
    setUser(null)
  }

  const sendPasswordResetFn = async (email: string) => {
    const { sendPasswordResetEmail } = await import('firebase/auth')
    await sendPasswordResetEmail(getAuth(), email)
  }

  const confirmPasswordResetFn = async (code: string, newPassword: string) => {
    const { confirmPasswordReset } = await import('firebase/auth')
    await confirmPasswordReset(getAuth(), code, newPassword)
  }

  return (
    <AuthContext.Provider
      value={{
        user, loading,
        signInWithEmail: signInWithEmailFn,
        signUpWithEmail: signUpWithEmailFn,
        signInWithGoogle: signInWithGoogleFn,
        signInWithGithub: signInWithGithubFn,
        signOut: signOutFn,
        sendPasswordReset: sendPasswordResetFn,
        confirmPasswordReset: confirmPasswordResetFn,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    return {
      user: null, loading: true,
      signInWithEmail: async () => { throw new Error('Auth not initialized') },
      signUpWithEmail: async () => { throw new Error('Auth not initialized') },
      signInWithGoogle: async () => { throw new Error('Auth not initialized') },
      signInWithGithub: async () => { throw new Error('Auth not initialized') },
      signOut: async () => {},
      sendPasswordReset: async () => { throw new Error('Auth not initialized') },
      confirmPasswordReset: async () => { throw new Error('Auth not initialized') },
    }
  }
  return ctx
}
