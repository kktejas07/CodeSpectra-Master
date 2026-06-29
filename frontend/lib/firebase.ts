import { initializeApp, getApps } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import type { Auth } from 'firebase/auth'

export interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
}

let _dynamicConfig: FirebaseConfig | null = null
let _auth: Auth | null = null

function buildConfig(): FirebaseConfig | null {
  if (_dynamicConfig) return _dynamicConfig

  const env: Record<string, string | undefined> = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  }
  const missing = Object.entries(env).filter(([, v]) => !v)
  if (missing.length === 0) {
    return env as unknown as FirebaseConfig
  }
  return null
}

export function setFirebaseConfig(config: FirebaseConfig): void {
  _dynamicConfig = config
  _auth = null
}

export function prefetchFirebaseConfig(): Promise<FirebaseConfig | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (_dynamicConfig) return Promise.resolve(_dynamicConfig)
  return fetch('/api/firebase-config', { credentials: 'omit' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data: Record<string, string> | null) => {
      if (data?.apiKey && data?.projectId) {
        _dynamicConfig = {
          apiKey: data.apiKey,
          authDomain: data.authDomain || '',
          projectId: data.projectId,
          storageBucket: data.storageBucket || '',
          messagingSenderId: data.messagingSenderId || '',
          appId: data.appId || '',
        }
        return _dynamicConfig
      }
      if (buildConfig()) return buildConfig()
      return null
    })
    .catch(() => (buildConfig() ? buildConfig() : null))
}

export function getFirebaseAuth(): Auth | null {
  if (_auth) return _auth
  if (typeof window === 'undefined') return null
  const config = _dynamicConfig || buildConfig()
  if (!config) return null
  try {
    const app = getApps().length === 0 ? initializeApp(config) : getApps()[0]
    _auth = getAuth(app)
    return _auth
  } catch (e) {
    console.warn('[Firebase] Init error:', e)
    return null
  }
}
