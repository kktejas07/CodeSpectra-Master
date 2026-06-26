import type { Auth } from 'firebase-admin/auth'

let _adminAuth: Auth | null = null

async function getAdminAuth(): Promise<Auth | null> {
  if (_adminAuth) return _adminAuth

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('[Firebase Admin] Missing credentials — admin features disabled')
    return null
  }

  try {
    const { cert, initializeApp, getApps } = await import('firebase-admin/app')
    const { getAuth } = await import('firebase-admin/auth')

    const app = getApps().length === 0
      ? initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey: privateKey.replace(/\\n/g, '\n'),
          }),
        })
      : getApps()[0]

    _adminAuth = getAuth(app)
    return _adminAuth
  } catch (e) {
    console.error('[Firebase Admin] Init failed:', e)
    return null
  }
}

export async function verifyIdToken(token: string) {
  const auth = await getAdminAuth()
  if (!auth) return null
  try {
    return await auth.verifyIdToken(token)
  } catch {
    return null
  }
}

export async function createSessionCookie(idToken: string, expiresIn: number) {
  const auth = await getAdminAuth()
  if (!auth) return null
  return auth.createSessionCookie(idToken, { expiresIn })
}

export async function verifySessionCookie(sessionCookie: string) {
  const auth = await getAdminAuth()
  if (!auth) return null
  try {
    return await auth.verifySessionCookie(sessionCookie, true)
  } catch {
    return null
  }
}

export async function getAdminAuthInstance() {
  return getAdminAuth()
}

export { getAdminAuth as adminAuth }
