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

type OAuthExchange =
  | { ok: true }
  | { ignored: true }
  | { twoFactorRequired: true }
  | { error: string; code?: string; status: number }

/**
 * Trade the Firebase ID token for a CodeSpectra session. The server decides:
 * a valid session already → refresh; 2FA on → pending second factor;
 * deactivated / unlinkable account → error.
 */
async function exchangeOAuthSession(fbUser: { getIdToken: (force?: boolean) => Promise<string> }, loginMethod?: 'google' | 'github', force = false): Promise<OAuthExchange> {
  const idToken = await fbUser.getIdToken(force)
  const body: Record<string, string> = { idToken }
  if (loginMethod) body.loginMethod = loginMethod
  await withFingerprint(body)
  const res = await csrfFetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({} as Record<string, unknown>))
  if (json.twoFactorRequired) return { twoFactorRequired: true }
  if (json.ignored) return { ignored: true }
  if (!res.ok) return { error: String(json.error || 'Sign-in didn’t complete. Try again.'), code: typeof json.code === 'string' ? json.code : undefined, status: res.status }
  return { ok: true }
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
  const [pendingOAuth2fa, setPendingOAuth2fa] = useState(false)
  const clearSessionExpired = () => setSessionExpired(false)

  // A dashboard page whose session ended (revoked, expired, deactivated, or a
  // Google/GitHub sign-in still waiting for its 2FA code) goes to sign-in and
  // comes back afterwards, instead of failing every API call with 401s.
  useEffect(() => {
    if (!sessionExpired && !pendingOAuth2fa) return
    if (typeof window === 'undefined') return
    const path = window.location.pathname
    if (!path.startsWith('/dashboard')) return
    let cancelled = false
    // The flag may be stale (e.g. the 2FA step finished on the login page):
    // only leave when the server really has no session.
    fetch('/api/auth/session', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((data) => {
        if (cancelled) return
        if (data?.user) {
          setSessionExpired(false)
          setPendingOAuth2fa(false)
          return
        }
        const back = encodeURIComponent(path + window.location.search)
        window.location.assign(`/auth/login?redirect=${back}&${pendingOAuth2fa ? 'twofactor=oauth' : 'expired=1'}`)
      })
    return () => { cancelled = true }
  }, [sessionExpired, pendingOAuth2fa])

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
            try {
              const r = await exchangeOAuthSession(fbUser)
              if ('ok' in r) {
                setUser(toAuthUser(fbUser))
                setPendingOAuth2fa(false)
                setSessionExpired(false)
              } else if ('ignored' in r) {
                // Another account holds the session; drop the stale Firebase
                // login (the listener re-runs with null and reads the cookie).
                try { await firebaseSignOut(a) } catch {}
                return
              } else if ('twoFactorRequired' in r) {
                // Signed in with Google/GitHub but the authenticator code is
                // still owed — no session yet.
                setUser(null)
                setPendingOAuth2fa(true)
              } else if (r.status === 401 || r.status === 403 || r.status === 409) {
                // Revoked, deactivated or unlinkable — stop the Firebase loop.
                try { await firebaseSignOut(a) } catch {}
                setUser(null)
                setSessionExpired(true)
              }
            } catch { /* network — keep current state; heartbeat retries */ }
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
        const r = await exchangeOAuthSession(a.currentUser, undefined, true)
        if (!('ok' in r) && !('ignored' in r)) {
          if ('twoFactorRequired' in r) setPendingOAuth2fa(true)
          setUser(null)
          setSessionExpired(true)
        }
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
    // "Require email verification" is on: the account exists but has no
    // session until the emailed link is clicked.
    if (json.verificationRequired) {
      throw Object.assign(new Error('Account created. Check your email and click the verification link, then sign in.'), { code: 'verification_required' })
    }
    setUser(toAuthUser({ uid: json.user.id, email: json.user.email, displayName: json.user.name }))
    await reportFingerprint(json.user.id)
  }

  const finishOAuthSignIn = async (auth: ReturnType<typeof getAuth>, fbUser: Parameters<typeof toAuthUser>[0] & { getIdToken: (force?: boolean) => Promise<string> }, method: 'google' | 'github') => {
    setSessionExpired(false)
    const r = await exchangeOAuthSession(fbUser, method)
    if ('twoFactorRequired' in r) {
      setLastLogin(method)
      throw { twoFactorRequired: true, message: 'Two-factor code required' }
    }
    if ('error' in r || 'ignored' in r) {
      try { await firebaseSignOut(auth) } catch {}
      setUser(null)
      throw new Error('error' in r ? r.error : 'Sign-in didn’t complete. Try again.')
    }
    setPendingOAuth2fa(false)
    setLastLogin(method)
    setUser(toAuthUser(fbUser))
    await reportFingerprint(fbUser.uid)
  }

  const signInWithGoogleFn = async () => {
    const auth = getAuth()
    const provider = new GoogleAuthProvider()
    provider.addScope('email'); provider.addScope('profile')
    const cred = await signInWithPopup(auth, provider)
    await finishOAuthSignIn(auth, cred.user, 'google')
  }

  const signInWithGithubFn = async () => {
    const auth = getAuth()
    const provider = new GithubAuthProvider()
    provider.addScope('user:email')
    const cred = await signInWithPopup(auth, provider)
    await finishOAuthSignIn(auth, cred.user, 'github')
  }

  const signOutFn = async () => {
    // PWA: drop this device's app push + offline practice data while the session still exists.
    await import('@/lib/pwa/sign-out').then((m) => m.pwaSignOutCleanup()).catch(() => undefined)
    try { await firebaseSignOut(getAuth()) } catch {}
    await csrfFetch('/api/auth/session', { method: 'DELETE' })
    setUser(null)
    setSessionExpired(false)
    setPendingOAuth2fa(false)
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
