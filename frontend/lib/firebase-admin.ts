import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const adminApp =
  getApps().length === 0
    ? initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      })
    : getApps()[0]

export const adminAuth = getAuth(adminApp)

export async function verifyIdToken(token: string) {
  try {
    const decoded = await adminAuth.verifyIdToken(token)
    return decoded
  } catch {
    return null
  }
}

export async function createSessionCookie(idToken: string, expiresIn: number) {
  return adminAuth.createSessionCookie(idToken, { expiresIn })
}

export async function verifySessionCookie(sessionCookie: string) {
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
    return decoded
  } catch {
    return null
  }
}
