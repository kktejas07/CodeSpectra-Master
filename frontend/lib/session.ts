import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { getMongoDb } from '@/lib/mongodb'

const SESSION_COOKIE = 'codespectra_session'

let _secret: Uint8Array | null = null

function getSecret(): Uint8Array {
  if (_secret) return _secret
  const raw = process.env.SESSION_SECRET
  if (!raw) {
    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
      throw new Error(
        'SESSION_SECRET environment variable is required in production. ' +
        'Generate a 32+ character secret with: openssl rand -base64 32',
      )
    }
    console.warn(
      '[session] SESSION_SECRET not set — using development fallback. ' +
      'Set SESSION_SECRET in your environment for production.',
    )
  }
  _secret = new TextEncoder().encode(raw || 'dev-secret-do-not-use-in-production-32chars')
  return _secret
}

export interface SessionPayload {
  uid: string
  email: string
  role: string
  ver?: number
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  let ver = payload.ver
  if (ver === undefined) {
    try {
      const db = await getMongoDb()
      const user = await db.collection('user').findOne(
        { id: payload.uid },
        { projection: { session_version: 1 } },
      )
      ver = (user?.session_version as number) ?? 1
    } catch {
      ver = 1
    }
  }
  return new SignJWT({ ...payload, ver })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret())
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    const data = payload as unknown as SessionPayload
    if (!data.uid) return null
    // Check session version (revocation)
    try {
      const db = await getMongoDb()
      const user = await db.collection('user').findOne(
        { id: data.uid },
        { projection: { session_version: 1 } },
      )
      const currentVer = (user?.session_version as number) ?? 1
      if (data.ver !== undefined && data.ver < currentVer) return null
    } catch {
      // If DB check fails, allow token (defense-in-depth, not blocking)
    }
    return data
  } catch {
    return null
  }
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await signSessionToken(payload)
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  const db = await getMongoDb()
  await db.collection('user').updateOne(
    { id: userId },
    { $inc: { session_version: 1 } },
  )
}
