import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const SESSION_COOKIE = 'codespectra_session'
const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || 'fallback-dev-secret-do-not-use-in-production-32chars',
)

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
    .sign(SECRET)
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
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
