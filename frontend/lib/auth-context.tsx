'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider,
  GithubAuthProvider,
  sendPasswordResetEmail,
  confirmPasswordReset,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { getFirebaseAuth, prefetchFirebaseConfig, setFirebaseConfig } from './firebase'
import type { User } from 'firebase/auth'

export interface AuthUser {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  getIdToken: () => Promise<string>
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

function toAuthUser(firebaseUser: User): AuthUser {
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.displayName,
    photoURL: firebaseUser.photoURL,
    getIdToken: () => firebaseUser.getIdToken(),
  }
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
          if (!cancelled) setLoading(false)
          return
        }
        unsubscribe = onAuthStateChanged(a, async (firebaseUser) => {
          if (cancelled) return
          if (firebaseUser) {
            setUser(toAuthUser(firebaseUser))
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
    await signInWithEmailAndPassword(getAuth(), email, password)
  }

  const signUpWithEmailFn = async (email: string, password: string, name: string) => {
    const auth = getAuth()
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    if (cred.user) {
      await updateProfile(cred.user, { displayName: name })
    }
  }

  const signInWithGoogleFn = async () => {
    const auth = getAuth()
    const provider = new GoogleAuthProvider()
    provider.addScope('email')
    provider.addScope('profile')
    await signInWithPopup(auth, provider)
  }

  const signInWithGithubFn = async () => {
    const auth = getAuth()
    const provider = new GithubAuthProvider()
    provider.addScope('user:email')
    await signInWithPopup(auth, provider)
  }

  const signOutFn = async () => {
    await firebaseSignOut(getAuth())
  }

  const sendPasswordResetFn = async (email: string) => {
    await sendPasswordResetEmail(getAuth(), email)
  }

  const confirmPasswordResetFn = async (code: string, newPassword: string) => {
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
