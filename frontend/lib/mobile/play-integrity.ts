/**
 * Play Integrity for the Android app — an integrity SIGNAL, never a gate.
 *
 * Flow: the app asks GET /api/mobile/integrity for a one-time nonce, asks
 * Google Play for a token bound to it (CodeSpectraNative.requestIntegrityToken),
 * and POSTs the token back. The server decodes it with Google
 * (playintegrity.googleapis.com …:decodeIntegrityToken, service-account
 * OAuth), checks package / nonce / freshness / signing certificate, and
 * stores the device trust for this session (mobile_device_trust, 24 h).
 *
 * Config (Admin → server secrets, env fallback):
 *   play_integrity_service_account_json  PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON  (secret)
 *   android_package_names                ANDROID_PACKAGE_NAMES  default "ai.codespectra.app"
 *   android_cert_sha256                  ANDROID_CERT_SHA256    optional, comma-separated
 *       base64url SHA-256 of the app signing certificate (Play Console → App integrity)
 */
import { createHash, randomBytes } from 'node:crypto'
import { importPKCS8, SignJWT } from 'jose'
import { getMongoDb } from '@/lib/mongodb'

export type DeviceTrust = 'strong' | 'device' | 'basic' | 'none'

export interface IntegrityPayload {
  requestDetails?: { requestPackageName?: string; nonce?: string; timestampMillis?: string | number }
  appIntegrity?: { appRecognitionVerdict?: string; packageName?: string; certificateSha256Digest?: string[]; versionCode?: string | number }
  deviceIntegrity?: { deviceRecognitionVerdict?: string[] }
  accountDetails?: { appLicensingVerdict?: string }
}

export interface IntegrityVerdict {
  /** Request matched (package, nonce, freshness). false = token is not usable at all. */
  valid: boolean
  trust: DeviceTrust
  app_recognized: boolean
  licensed: boolean | null
  reasons: string[]
}

export const NONCE_TTL_MS = 5 * 60_000
export const MAX_TOKEN_AGE_MS = 5 * 60_000
export const TRUST_TTL_MS = 24 * 3_600_000

export const newIntegrityNonce = (): string => randomBytes(32).toString('base64url')
export const isIntegrityToken = (v: unknown): v is string => typeof v === 'string' && v.length >= 100 && v.length <= 20_000 && /^[A-Za-z0-9._-]+$/.test(v)
export const isPackageName = (v: unknown): v is string => typeof v === 'string' && /^[a-z][a-z0-9_]*(\.[a-z0-9_]+){1,5}$/.test(v) && v.length <= 120

/** Base64 and base64url both appear in the wild; compare them as base64url without padding. */
const b64url = (s: string) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Pure: judge a decoded Play Integrity payload. */
export function evaluateIntegrity(
  p: IntegrityPayload,
  expect: { packageName: string; nonce: string; certDigests: string[]; now?: number },
): IntegrityVerdict {
  const reasons: string[] = []
  const now = expect.now ?? Date.now()
  const rd = p.requestDetails ?? {}
  if (rd.requestPackageName !== expect.packageName) reasons.push('package_mismatch')
  if (!rd.nonce || b64url(rd.nonce) !== b64url(expect.nonce)) reasons.push('nonce_mismatch')
  const ts = Number(rd.timestampMillis)
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_TOKEN_AGE_MS) reasons.push('stale')
  const valid = reasons.length === 0

  const app = p.appIntegrity ?? {}
  let appRecognized = app.appRecognitionVerdict === 'PLAY_RECOGNIZED' && app.packageName === expect.packageName
  if (!appRecognized) reasons.push(`app_${String(app.appRecognitionVerdict || 'unevaluated').toLowerCase()}`)
  if (expect.certDigests.length) {
    const want = new Set(expect.certDigests.map(b64url))
    const got = (app.certificateSha256Digest ?? []).map(b64url)
    if (!got.some((d) => want.has(d))) {
      appRecognized = false
      reasons.push('cert_mismatch')
    }
  }

  const dv = new Set(p.deviceIntegrity?.deviceRecognitionVerdict ?? [])
  let trust: DeviceTrust = dv.has('MEETS_STRONG_INTEGRITY') ? 'strong' : dv.has('MEETS_DEVICE_INTEGRITY') ? 'device' : dv.has('MEETS_BASIC_INTEGRITY') ? 'basic' : 'none'
  if (trust === 'none') reasons.push('device_not_trusted')
  if (!valid) trust = 'none'

  const lic = p.accountDetails?.appLicensingVerdict
  return { valid, trust, app_recognized: valid && appRecognized, licensed: lic === 'LICENSED' ? true : lic === 'UNLICENSED' ? false : null, reasons }
}

// ── Config ───────────────────────────────────────────────────────────────

export interface IntegrityConfig {
  serviceAccount: { client_email: string; private_key: string; token_uri?: string } | null
  packageNames: string[]
  certDigests: string[]
}

const splitList = (s: string | undefined) => (s || '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean)

export async function integrityConfig(): Promise<IntegrityConfig> {
  let rec: Record<string, string | undefined> = {}
  try {
    const { readServerSecrets } = await import('@/lib/server-secrets-cache')
    rec = (await readServerSecrets()) as Record<string, string | undefined>
  } catch { /* env fallback */ }
  const json = rec.play_integrity_service_account_json || process.env.PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON || ''
  let serviceAccount: IntegrityConfig['serviceAccount'] = null
  try {
    const sa = json ? JSON.parse(json) : null
    if (sa && typeof sa.client_email === 'string' && typeof sa.private_key === 'string') serviceAccount = sa
  } catch { /* invalid JSON = not configured */ }
  const packageNames = splitList(rec.android_package_names || process.env.ANDROID_PACKAGE_NAMES).filter(isPackageName)
  return {
    serviceAccount,
    packageNames: packageNames.length ? packageNames : ['ai.codespectra.app'],
    certDigests: splitList(rec.android_cert_sha256 || process.env.ANDROID_CERT_SHA256),
  }
}

// ── Google calls ─────────────────────────────────────────────────────────

let tokenCache: { key: string; token: string; exp: number } | null = null

async function googleAccessToken(sa: NonNullable<IntegrityConfig['serviceAccount']>): Promise<string> {
  const key = createHash('sha256').update(sa.client_email + sa.private_key).digest('hex')
  if (tokenCache && tokenCache.key === key && tokenCache.exp - 60_000 > Date.now()) return tokenCache.token
  const tokenUri = 'https://oauth2.googleapis.com/token'
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/playintegrity' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setAudience(tokenUri)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(await importPKCS8(sa.private_key, 'RS256'))
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`google_oauth_${res.status}`)
  const j = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!j.access_token) throw new Error('google_oauth_empty')
  tokenCache = { key, token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 }
  return j.access_token
}

export async function decodeIntegrityToken(cfg: IntegrityConfig, packageName: string, integrityToken: string): Promise<IntegrityPayload> {
  if (!cfg.serviceAccount) throw new Error('not_configured')
  const access = await googleAccessToken(cfg.serviceAccount)
  const res = await fetch(`https://playintegrity.googleapis.com/v1/${encodeURIComponent(packageName)}:decodeIntegrityToken`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ integrity_token: integrityToken }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`play_integrity_${res.status}`)
  const j = (await res.json()) as { tokenPayloadExternal?: IntegrityPayload }
  if (!j.tokenPayloadExternal) throw new Error('play_integrity_empty')
  return j.tokenPayloadExternal
}

// ── Storage ──────────────────────────────────────────────────────────────

let indexed = false
async function db() {
  const d = await getMongoDb()
  if (!indexed) {
    indexed = true
    await Promise.all([
      d.collection('mobile_integrity_nonces').createIndex({ nonce: 1 }, { unique: true, name: 'min_nonce' }),
      d.collection('mobile_integrity_nonces').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'min_ttl' }),
      d.collection('mobile_device_trust').createIndex({ user_id: 1, sid: 1 }, { unique: true, name: 'mdt_user_sid' }),
      d.collection('mobile_device_trust').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'mdt_ttl' }),
    ]).catch(() => { indexed = false })
  }
  return d
}

export async function issueNonce(userId: string): Promise<{ nonce: string; expires_at: string }> {
  const nonce = newIntegrityNonce()
  const expires = new Date(Date.now() + NONCE_TTL_MS)
  await (await db()).collection('mobile_integrity_nonces').insertOne({ nonce, user_id: userId, created_at: new Date(), expires_at: expires })
  return { nonce, expires_at: expires.toISOString() }
}

/** One-time: the nonce must be this user's and unexpired; it is deleted either way. */
export async function consumeNonce(userId: string, nonce: string): Promise<boolean> {
  const doc = await (await db()).collection('mobile_integrity_nonces').findOneAndDelete({ nonce, user_id: userId })
  return !!doc && (doc.expires_at as Date).getTime() > Date.now()
}

export interface DeviceTrustDoc extends Omit<IntegrityVerdict, 'valid'> {
  user_id: string
  sid: string
  package: string
  checked_at: Date
  expires_at: Date
}

export async function saveDeviceTrust(userId: string, sid: string, pkg: string, v: IntegrityVerdict): Promise<void> {
  const now = new Date()
  const doc: DeviceTrustDoc = {
    user_id: userId, sid, package: pkg, trust: v.trust, app_recognized: v.app_recognized, licensed: v.licensed,
    reasons: v.reasons.slice(0, 10), checked_at: now, expires_at: new Date(now.getTime() + TRUST_TTL_MS),
  }
  await (await db()).collection('mobile_device_trust').updateOne({ user_id: userId, sid }, { $set: doc }, { upsert: true })
}

/** Latest device trust for a user (optionally one session). Signal only — never block on it. */
export async function getDeviceTrust(userId: string, sid?: string): Promise<DeviceTrustDoc | null> {
  const q = sid ? { user_id: userId, sid } : { user_id: userId }
  const doc = await (await db()).collection('mobile_device_trust').find(q).sort({ checked_at: -1 }).limit(1).next()
  if (!doc) return null
  const { _id, ...rest } = doc
  void _id
  return rest as unknown as DeviceTrustDoc
}
