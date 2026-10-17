import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { randomUUID } from 'node:crypto'
import { ObjectId } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { accountBlockReason, isSessionVersionCurrent, type AuthProfileLike } from '@/lib/auth-account'
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
  /** Per-session id, so one sign-out can revoke just this session. */
  sid?: string
}

// ─── Auth profile loader (short cache) ──────────────────────────────────────
// Every authenticated request needs the user's role, status, tenant and
// session_version. Cache them for a few seconds per process; any change that
// must bite immediately calls invalidateAuthProfile(). Other instances catch
// up within AUTH_PROFILE_TTL_MS.

const AUTH_PROFILE_TTL_MS = 10_000
const AUTH_PROFILE_FIELDS = {
  _id: 1, id: 1, email: 1, name: 1, fullName: 1, role: 1, status: 1, isActive: 1, deletedAt: 1,
  tenantId: 1, organizationId: 1, session_version: 1, sessions_revoked_at: 1,
  lastLoginMethod: 1, lastLoginAt: 1, firebase_uid: 1,
} as const

export interface AuthProfile extends AuthProfileLike {
  _id?: unknown
  id?: string
  email?: string
  name?: string | null
  fullName?: string | null
  lastLoginMethod?: string | null
  lastLoginAt?: Date | null
}

const _profileCache = new Map<string, { at: number; profile: AuthProfile | null }>()
const _tenantCache = new Map<string, { at: number; active: boolean }>()

function uidFilter(uid: string) {
  const or: Record<string, unknown>[] = [{ id: uid }, { _id: uid }, { firebase_uid: uid }]
  if (ObjectId.isValid(uid) && /^[0-9a-f]{24}$/i.test(uid)) or.push({ _id: new ObjectId(uid) })
  return { $or: or }
}

/** Load the auth-relevant user fields (cached ~10s). Throws when the DB is unreachable. */
export async function loadAuthProfile(uid: string): Promise<AuthProfile | null> {
  const hit = _profileCache.get(uid)
  if (hit && Date.now() - hit.at < AUTH_PROFILE_TTL_MS) return hit.profile
  const db = await getMongoDb()
  const profile = (await db.collection('user').findOne(uidFilter(uid) as never, { projection: AUTH_PROFILE_FIELDS })) as AuthProfile | null
  _profileCache.set(uid, { at: Date.now(), profile })
  if (_profileCache.size > 5000) {
    const first = _profileCache.keys().next().value
    if (first) _profileCache.delete(first)
  }
  return profile
}

/** Is this tenant present and active? (cached ~10s; null tenant ⇒ true). */
export async function isTenantActive(tenantId: string | null): Promise<boolean> {
  if (!tenantId) return true
  const hit = _tenantCache.get(tenantId)
  if (hit && Date.now() - hit.at < AUTH_PROFILE_TTL_MS) return hit.active
  const db = await getMongoDb()
  const t = await db.collection('tenants').findOne({ id: tenantId }, { projection: { is_active: 1 } })
  const active = !!t && t.is_active !== false
  _tenantCache.set(tenantId, { at: Date.now(), active })
  return active
}

export function invalidateAuthProfile(uid?: string): void {
  if (uid) _profileCache.delete(uid)
  else _profileCache.clear()
}

export function invalidateTenantCache(tenantId?: string): void {
  if (tenantId) _tenantCache.delete(tenantId)
  else _tenantCache.clear()
}

export async function signSessionToken(payload: SessionPayload, expiresIn: string = '7d'): Promise<string> {
  let ver = payload.ver
  if (ver === undefined) {
    try {
      invalidateAuthProfile(payload.uid)
      const user = await loadAuthProfile(payload.uid)
      ver = (user?.session_version as number) ?? 1
    } catch {
      ver = 1
    }
  }
  const sid = payload.sid || randomUUID()
  return new SignJWT({ ...payload, ver, sid })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(await getSecret())
}

const _revokedSidCache = new Map<string, { at: number; revoked: boolean }>()

async function isSessionIdRevoked(sid: string): Promise<boolean> {
  const hit = _revokedSidCache.get(sid)
  if (hit && Date.now() - hit.at < AUTH_PROFILE_TTL_MS) return hit.revoked
  const db = await getMongoDb()
  const row = await db.collection('revoked_sessions').findOne({ sid }, { projection: { _id: 1 } })
  _revokedSidCache.set(sid, { at: Date.now(), revoked: !!row })
  if (_revokedSidCache.size > 5000) {
    const first = _revokedSidCache.keys().next().value
    if (first) _revokedSidCache.delete(first)
  }
  return !!row
}

/**
 * Verify a session JWT: signature, expiry, the account still exists and is
 * active, the session version is current, and this session wasn't signed
 * out. Fails closed — if the account can't be checked, the token is refused.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  let data: SessionPayload & { exp?: number }
  try {
    const { payload } = await jwtVerify(token, await getSecret())
    data = payload as unknown as SessionPayload & { exp?: number }
  } catch {
    return null
  }
  if (!data.uid || typeof data.uid !== 'string') return null
  try {
    const profile = await loadAuthProfile(data.uid)
    if (accountBlockReason(profile)) return null
    if (!isSessionVersionCurrent(data.ver, profile)) return null
    if (data.sid && (await isSessionIdRevoked(data.sid))) return null
  } catch (e) {
    console.error('[session] account check failed — refusing token:', e)
    return null
  }
  return data
}

/** Sign out one session (logout): its id goes on a deny-list until it would have expired. */
export async function revokeSessionToken(token: string | null | undefined): Promise<void> {
  if (!token) return
  try {
    const { payload } = await jwtVerify(token, await getSecret())
    const sid = typeof payload.sid === 'string' ? payload.sid : ''
    if (!sid) return
    const exp = typeof payload.exp === 'number' ? new Date(payload.exp * 1000) : new Date(Date.now() + 30 * 86400_000)
    const db = await getMongoDb()
    const col = db.collection('revoked_sessions')
    await col.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'revoked_sessions_ttl' }).catch(() => {})
    await col.createIndex({ sid: 1 }, { unique: true, name: 'revoked_sessions_sid' }).catch(() => {})
    await col.updateOne({ sid }, { $set: { sid, uid: payload.uid ?? null, expires_at: exp, revoked_at: new Date() } }, { upsert: true })
    _revokedSidCache.set(sid, { at: Date.now(), revoked: true })
  } catch {
    // invalid / expired token — nothing to revoke
  }
}

/** The session payload of the current request's cookie, if valid. */
export async function readSessionCookie(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const raw = cookieStore.get(SESSION_COOKIE)?.value
  return raw ? verifySessionToken(raw) : null
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
  method: 'face' | 'sso' | 'oauth'
  redirect?: string
}

/** First factor passed (face / SSO / Google-GitHub); park the user until they enter a TOTP code. */
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

/**
 * Sign the user out everywhere: bump session_version (kills every session
 * JWT), stamp sessions_revoked_at (kills Firebase session cookies / ID
 * tokens issued before now) and revoke Firebase refresh tokens so a still
 * signed-in Firebase client can't silently mint a new session.
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  const db = await getMongoDb()
  const profile = await db.collection('user').findOne(uidFilter(userId) as never, { projection: { _id: 1, id: 1, firebase_uid: 1 } })
  const filter = profile ? { _id: profile._id } : uidFilter(userId)
  await db.collection('user').updateOne(
    filter as never,
    { $inc: { session_version: 1 }, $set: { sessions_revoked_at: new Date() } },
  )
  invalidateAuthProfile(userId)
  if (profile?.id) invalidateAuthProfile(String(profile.id))
  try {
    const { getAdminAuthInstance } = await import('@/lib/firebase-admin')
    const auth = await getAdminAuthInstance()
    if (auth) {
      const ids = new Set([userId, profile?.id, profile?.firebase_uid].filter((x): x is string => typeof x === 'string' && !!x))
      for (const id of ids) await auth.revokeRefreshTokens(id).catch(() => {})
    }
  } catch {
    // Firebase optional
  }
}
