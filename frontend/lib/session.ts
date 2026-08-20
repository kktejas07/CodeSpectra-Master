import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { getMongoDb } from '@/lib/mongodb'

const SESSION_COOKIE = 'codespectra_session'

let _secret: Uint8Array | null = null
let _secretPromise: Promise<Uint8Array> | null = null

/**
 * Resolve the session signing secret. Priority: env var first, then a secret
 * persisted in Mongo `platform_settings.secrets.session_secret`. The DB-backed
 * fallback exists so a fresh container (rebuilt by Dokploy) never hard-fails on
 * login just because `SESSION_SECRET` was dropped from the service env (Dokploy
 * re-applies its own stored env on every roll, wiping ad-hoc --env-add values).
 *
 * Security note: the DB secret is exactly as secret as the DB is; it lives in the
 * same `platform_settings` record that already stores every API key (see
 * server-secrets-cache.ts). Because it is a per-app random 64+ hex string and never
 * ships in code, it does not weaken the earlier "no public fallback key" guarantee.
 */
async function resolveSecret(): Promise<Uint8Array> {
  const raw = process.env.SESSION_SECRET
  if (raw && raw.length >= 32) {
    _secret = new TextEncoder().encode(raw)
    return _secret
  }
  try {
    const { readServerSecrets, isMaskedSecret } = await import('@/lib/server-secrets-cache')
    const secrets = await readServerSecrets()
    const stored = typeof secrets.session_secret === 'string' ? secrets.session_secret.trim() : ''
    if (stored.length >= 32 && !isMaskedSecret(stored)) {
      _secret = new TextEncoder().encode(stored)
      return _secret
    }
  } catch {
    // fall through to env failure handling
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[session] SESSION_SECRET must be set to a 32+ char random string in production. ' +
      'Set SESSION_SECRET in the service env or store `session_secret` in ' +
      'MongoDB platform_settings.secrets. Refusing to start with a weak signing key.',
    )
  }
  console.warn(
    '[session] SESSION_SECRET not set or too short — using development fallback. ' +
    'Set SESSION_SECRET (32+ chars) in your environment.',
  )
  _secret = new TextEncoder().encode('dev-secret-do-not-use-in-production-32chars')
  return _secret
}

async function getSecret(): Promise<Uint8Array> {
  if (_secret) return _secret
  _secretPromise ??= resolveSecret().catch((err) => {
    _secretPromise = null
    throw err
  })
  return _secretPromise
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
        { $or: [{ id: payload.uid }, { _id: payload.uid as any }] },
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
    .sign(await getSecret())
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, await getSecret())
    const data = payload as unknown as SessionPayload
    if (!data.uid) return null
    // Check session version (revocation)
    try {
      const db = await getMongoDb()
      const user = await db.collection('user').findOne(
        { $or: [{ id: data.uid }, { _id: data.uid as any }] },
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
