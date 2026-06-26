'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getFirebaseAuth, getFirebaseAuthSync } from './firebase'
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

function getFirebaseModule() {
  return import('firebase/auth')
}

async function withAuth<T>(fn: (auth: import('firebase/auth').Auth) => Promise<T>): Promise<T> {
  const auth = await getFirebaseAuth()
  if (!auth) throw new Error('Firebase not available')
  return fn(auth)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    getFirebaseAuth().then((auth) => {
      if (cancelled || !auth) {
        if (!cancelled) setLoading(false)
        return
      }

      getFirebaseModule().then(({ onAuthStateChanged }) => {
        if (cancelled) return
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          if (cancelled) return
          if (firebaseUser) {
            setUser(toAuthUser(firebaseUser))
            await createSession(firebaseUser)
          } else {
            setUser(null)
            await clearSession()
          }
          setLoading(false)
        })

        // If auth is already resolved synchronously, clean up immediately
        if (getFirebaseAuthSync()) {
          setLoading(false)
        }
      })
    })

    return () => { cancelled = true }
  }, [])

  const signInWithEmail = async (email: string, password: string) => {
    await withAuth(async (auth) => {
      const { signInWithEmailAndPassword } = await getFirebaseModule()
      await signInWithEmailAndPassword(auth, email, password)
    })
  }

  const signUpWithEmail = async (email: string, password: string, name: string) => {
    await withAuth(async (auth) => {
      const { createUserWithEmailAndPassword } = await getFirebaseModule()
      await createUserWithEmailAndPassword(auth, email, password)
    })
  }

  const signInWithGoogle = async () => {
    await withAuth(async (auth) => {
      const { signInWithPopup, GoogleAuthProvider } = await getFirebaseModule()
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
    })
  }

  const signInWithGithub = async () => {
    await withAuth(async (auth) => {
      const { signInWithPopup, GithubAuthProvider } = await getFirebaseModule()
      const provider = new GithubAuthProvider()
      await signInWithPopup(auth, provider)
    })
  }

  const signOut = async () => {
    await withAuth(async (auth) => {
      const { signOut: firebaseSignOut } = await getFirebaseModule()
      await firebaseSignOut(auth)
    })
  }

  const sendPasswordReset = async (email: string) => {
    await withAuth(async (auth) => {
      const { sendPasswordResetEmail } = await getFirebaseModule()
      await sendPasswordResetEmail(auth, email)
    })
  }

  const confirmPasswordResetAction = async (code: string, newPassword: string) => {
    await withAuth(async (auth) => {
      const { confirmPasswordReset } = await getFirebaseModule()
      await confirmPasswordReset(auth, code, newPassword)
    })
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signInWithGithub,
        signOut,
        sendPasswordReset,
        confirmPasswordReset: confirmPasswordResetAction,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    return { user: null, loading: true, signInWithEmail: async () => {}, signUpWithEmail: async () => {}, signInWithGoogle: async () => {}, signInWithGithub: async () => {}, signOut: async () => {}, sendPasswordReset: async () => {}, confirmPasswordReset: async () => {} }
  }
  return ctx
}

async function createSession(firebaseUser: User) {
  const idToken = await firebaseUser.getIdToken()
  await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })
}

async function clearSession() {
  await fetch('/api/auth/session', { method: 'DELETE' })
}
