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

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID

  if (!apiKey || !authDomain || !projectId) return null

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  }
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
      if (data?.apiKey && data?.authDomain && data?.projectId) {
        const config: FirebaseConfig = {
          apiKey: data.apiKey,
          authDomain: data.authDomain,
          projectId: data.projectId,
          storageBucket: data.storageBucket || '',
          messagingSenderId: data.messagingSenderId || '',
          appId: data.appId || '',
        }
        if (!config.appId && buildConfig()) {
          const envCfg = buildConfig()
          if (envCfg?.appId) config.appId = envCfg.appId
          if (envCfg?.storageBucket) config.storageBucket = envCfg.storageBucket
          if (envCfg?.messagingSenderId) config.messagingSenderId = envCfg.messagingSenderId
        }
        _dynamicConfig = config
        return config
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
