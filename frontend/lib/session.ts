import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { getMongoDb } from '@/lib/mongodb'
import {
  generateRuntimeSecret,
  pickRuntimeSecret,
} from '@/lib/runtime-secrets'

const SESSION_COOKIE = 'codespectra_session'

let _secret: Uint8Array | null = null
let _secretPromise: Promise<Uint8Array> | null = null

async function persistSessionSecret(value: string): Promise<void> {
  const db = await getMongoDb()
  await db.collection('platform_settings').updateOne(
    { key: 'secrets' },
    { $set: { 'value.session_secret': value } },
    { upsert: true },
  )
}

/**
 * Canonical store is Mongo `platform_settings.secrets.session_secret`.
 * Env is bootstrap only — Dokploy rolls wipe ad-hoc `--env-add` values.
 * If both are empty, generate once and persist so the next rebuild still works.
 */
async function resolveSecret(): Promise<Uint8Array> {
  let stored = ''
  try {
    const { readServerSecrets, isMaskedSecret } = await import('@/lib/server-secrets-cache')
    const secrets = await readServerSecrets()
    stored = typeof secrets.session_secret === 'string' ? secrets.session_secret.trim() : ''
    if (isMaskedSecret(stored)) stored = ''
  } catch {
    // Mongo unavailable — try env / generate below
  }
  const picked = pickRuntimeSecret(process.env.SESSION_SECRET, stored)
  let raw = picked.value
  if (!raw) {
    raw = generateRuntimeSecret()
    try {
      await persistSessionSecret(raw)
      console.warn('[session] generated session_secret and stored it in Mongo')
    } catch {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          '[session] SESSION_SECRET missing and Mongo persist failed. ' +
          'Set MONGODB_URI so the container can read/write platform_settings.secrets.',
        )
      }
      console.warn(
        '[session] SESSION_SECRET not set or too short — using development fallback. ' +
        'Set SESSION_SECRET (32+ chars) in your environment.',
      )
      raw = 'dev-secret-do-not-use-in-production-32chars'
    }
  } else if (picked.source === 'env') {
    try {
      await persistSessionSecret(raw)
    } catch {
      // ponytail: login still works this process; next roll re-reads env or generates
    }
  }
  process.env.SESSION_SECRET = raw
  _secret = new TextEncoder().encode(raw)
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

export async function signSessionToken(payload: SessionPayload, expiresIn: string = '7d'): Promise<string> {
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
    .setExpirationTime(expiresIn)
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
      // Tokens minted before versioning carry no ver — treat them as version 1,
      // so a password-change bump (currentVer > 1) revokes them too.
      if ((data.ver ?? 1) !== currentVer) return null
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

/**
 * Short-lived signed tokens for a single purpose (pending second factor,
 * SSO state). The payload lives under `data` and never carries a top-level
 * `uid`, so verifySessionToken can never accept one as a session.
 */
export async function signPurposeToken(purpose: string, data: Record<string, unknown>, expiresIn = '10m'): Promise<string> {
  return new SignJWT({ purpose, data })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(await getSecret())
}

export async function verifyPurposeToken<T = Record<string, unknown>>(purpose: string, token: string | null | undefined): Promise<T | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, await getSecret())
    if (payload.purpose !== purpose || !payload.data || typeof payload.data !== 'object') return null
    return payload.data as T
  } catch {
    return null
  }
}

const PENDING_2FA_COOKIE = 'codespectra_2fa_pending'

export interface Pending2faPayload {
  uid: string
  email: string
  role: string
  method: 'face' | 'sso'
  redirect?: string
}

/** First factor passed (face / SSO); park the user until they enter a TOTP code. */
export async function setPending2faCookie(p: Pending2faPayload): Promise<void> {
  const token = await signPurposeToken('2fa_pending', { ...p }, '5m')
  const cookieStore = await cookies()
  cookieStore.set(PENDING_2FA_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 5 * 60,
  })
}

export async function readPending2faCookie(): Promise<Pending2faPayload | null> {
  const cookieStore = await cookies()
  return verifyPurposeToken<Pending2faPayload>('2fa_pending', cookieStore.get(PENDING_2FA_COOKIE)?.value)
}

export async function clearPending2faCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(PENDING_2FA_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 })
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  const db = await getMongoDb()
  await db.collection('user').updateOne(
    { $or: [{ id: userId }, { _id: userId as any }] },
    { $inc: { session_version: 1 } },
  )
}
