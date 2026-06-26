import type { Auth } from 'firebase/auth'

let _auth: Auth | null = null
let _initPromise: Promise<Auth | null> | null = null

export async function getFirebaseAuth(): Promise<Auth | null> {
  if (_auth) return _auth
  if (_initPromise) return _initPromise
  if (typeof window === 'undefined') return null

  _initPromise = (async () => {
    try {
      const { initializeApp, getApps } = await import('firebase/app')
      const { getAuth, connectAuthEmulator } = await import('firebase/auth')

      const firebaseConfig = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      }

      const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
      _auth = getAuth(app)

      if (process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST) {
        connectAuthEmulator(_auth, process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST)
      }

      return _auth
    } catch (e) {
      console.warn('[Firebase] Init error:', e)
      return null
    }
  })()

  return _initPromise
}

export function getFirebaseAuthSync(): Auth | null {
  return _auth
}
