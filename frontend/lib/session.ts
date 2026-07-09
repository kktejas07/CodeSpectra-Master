import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

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
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret())
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as unknown as SessionPayload
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
