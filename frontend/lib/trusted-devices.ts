/**
 * Trusted devices + emailed sign-in codes (I/O). Rules live in
 * lib/auth-trusted-device.ts and lib/auth-email-code.ts.
 *
 * - `trusted_devices`: { id, device_id, user_id, created_at, last_used_at,
 *   user_agent } — at most 10 per user, cleared by revokeAllUserSessions.
 * - `auth_email_codes`: { id, user_id, purpose, code_hash, attempts,
 *   expires_at, consumed_at } — TTL-indexed.
 *
 * The browser holds `cs_trusted_device`: an httpOnly JWT (purpose key)
 * naming the user id and a random device id. A device is trusted only when
 * the cookie verifies, names this user, AND its row still exists.
 */
import { cookies } from 'next/headers'
import { randomUUID } from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'
import { deriveServerKey } from '@/lib/session'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { sendEmail } from '@/lib/send-email'
import {
  MAX_TRUSTED_DEVICES,
  TRUSTED_DEVICE_COOKIE,
  TRUSTED_DEVICE_MAX_AGE_SEC,
  devicesToEvict,
  newDeviceId,
  signDeviceCookie,
  userAgentSummary,
  verifyDeviceCookie,
} from '@/lib/auth-trusted-device'
import {
  EMAIL_CODE_TTL_MS,
  checkEmailCode,
  generateEmailCode,
  hashEmailCode,
  type EmailCodeCheck,
} from '@/lib/auth-email-code'

export interface TrustedDeviceDoc {
  id: string
  device_id: string
  user_id: string
  created_at: Date
  last_used_at: Date
  user_agent: string
}

let _indexed = false
async function devices() {
  const db = await getMongoDb()
  const c = db.collection<TrustedDeviceDoc>('trusted_devices')
  if (!_indexed) {
    _indexed = true
    await c.createIndex({ user_id: 1, device_id: 1 }, { unique: true, name: 'trusted_devices_user_device' }).catch(() => {})
    await c.createIndex({ id: 1 }, { unique: true, name: 'trusted_devices_id' }).catch(() => {})
  }
  return c
}

const deviceKey = () => deriveServerKey('trusted-device')

/** The device id of this browser's trusted-device cookie, if it is valid and still trusted for `uid`. */
export async function trustedDeviceFor(uid: string): Promise<string | null> {
  try {
    const raw = (await cookies()).get(TRUSTED_DEVICE_COOKIE)?.value
    const parsed = await verifyDeviceCookie(raw, await deviceKey(), uid)
    if (!parsed) return null
    const row = await (await devices()).findOneAndUpdate(
      { user_id: uid, device_id: parsed.deviceId },
      { $set: { last_used_at: new Date() } },
    )
    return row ? row.id : null
  } catch {
    return null // fail closed: treat as a new device
  }
}

/**
 * After a full sign-in (password + 2FA, OAuth, SSO, or face + emailed code):
 * remember this browser for `uid`. Reuses the existing row when the cookie
 * is already valid for this user; otherwise adds one, keeping at most 10.
 * Best effort — never fails the sign-in.
 */
export async function trustCurrentDevice(uid: string, userAgent: string | null | undefined): Promise<void> {
  try {
    if (await trustedDeviceFor(uid)) return
    const c = await devices()
    const existing = await c.find({ user_id: uid }, { projection: { id: 1, last_used_at: 1 } }).toArray()
    const evict = devicesToEvict(existing, MAX_TRUSTED_DEVICES)
    if (evict.length) await c.deleteMany({ user_id: uid, id: { $in: evict } })
    const now = new Date()
    const deviceId = newDeviceId()
    await c.insertOne({ id: randomUUID(), device_id: deviceId, user_id: uid, created_at: now, last_used_at: now, user_agent: userAgentSummary(userAgent) })
    const token = await signDeviceCookie(uid, deviceId, await deviceKey())
    ;(await cookies()).set(TRUSTED_DEVICE_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: TRUSTED_DEVICE_MAX_AGE_SEC,
    })
  } catch (e) {
    console.error('[trusted-devices] could not trust device:', e)
  }
}

/** The user's trusted devices for settings (no device ids — those stay in the cookie). */
export async function listTrustedDevices(uid: string): Promise<{ id: string; user_agent: string; created_at: Date; last_used_at: Date; current: boolean }[]> {
  const c = await devices()
  const rows = await c.find({ user_id: uid }).sort({ last_used_at: -1 }).limit(MAX_TRUSTED_DEVICES * 2).toArray()
  let currentDeviceId: string | null = null
  try {
    const parsed = await verifyDeviceCookie((await cookies()).get(TRUSTED_DEVICE_COOKIE)?.value, await deviceKey(), uid)
    currentDeviceId = parsed?.deviceId ?? null
  } catch {
    currentDeviceId = null
  }
  return rows.map((r) => ({ id: r.id, user_agent: r.user_agent, created_at: r.created_at, last_used_at: r.last_used_at, current: r.device_id === currentDeviceId }))
}

export async function removeTrustedDevice(uid: string, id: string): Promise<boolean> {
  const res = await (await devices()).deleteOne({ user_id: uid, id })
  return res.deletedCount === 1
}

export async function removeAllTrustedDevices(uid: string): Promise<number> {
  const res = await (await devices()).deleteMany({ user_id: uid })
  return res.deletedCount
}

// ─── Emailed one-time codes ─────────────────────────────────────────────────

interface EmailCodeDoc {
  id: string
  user_id: string
  purpose: string
  code_hash: string
  attempts: number
  created_at: Date
  expires_at: Date
  consumed_at: Date | null
}

let _codesIndexed = false
async function codes() {
  const db = await getMongoDb()
  const c = db.collection<EmailCodeDoc>('auth_email_codes')
  if (!_codesIndexed) {
    _codesIndexed = true
    await c.createIndex({ id: 1 }, { unique: true, name: 'auth_email_codes_id' }).catch(() => {})
    await c.createIndex({ expires_at: 1 }, { expireAfterSeconds: 3600, name: 'auth_email_codes_ttl' }).catch(() => {})
  }
  return c
}

const codeKey = () => deriveServerKey('email-code')

/** SEO-033: in the account owner's language (lib/i18n/recipient). */
async function faceCodeEmail(uid: string, code: string) {
  const [{ emailTemplatesFor }, { localeForUser }] = await Promise.all([import('@/lib/email-templates'), import('@/lib/i18n/recipient')])
  return emailTemplatesFor(await localeForUser(uid)).notice({ key: 'faceCode', code })
}

/**
 * Create a code for `uid`, email it, and return the challenge id to park in
 * the pending cookie. Rate-limited to 3 codes per 10 minutes per account.
 * Any earlier unused face code for this account stops working.
 */
export async function issueFaceEmailCode(uid: string, email: string): Promise<{ ok: true; challengeId: string } | { ok: false; retryAfterSec?: number; reason: 'rate_limited' | 'send_failed' }> {
  const limit = await rateLimitRedis(`face-email-code:${uid}`, 3, 10 * 60_000)
  if (!limit.ok) return { ok: false, reason: 'rate_limited', retryAfterSec: limit.retryAfterSec }
  const c = await codes()
  const now = new Date()
  await c.updateMany({ user_id: uid, purpose: 'face_sign_in', consumed_at: null }, { $set: { consumed_at: now } })
  const challengeId = randomUUID()
  const code = generateEmailCode()
  await c.insertOne({
    id: challengeId,
    user_id: uid,
    purpose: 'face_sign_in',
    code_hash: hashEmailCode(code, await codeKey(), challengeId),
    attempts: 0,
    created_at: now,
    expires_at: new Date(now.getTime() + EMAIL_CODE_TTL_MS),
    consumed_at: null,
  })
  const sent = await sendEmail(email, await faceCodeEmail(uid, code), undefined, { category: 'transactional' }).catch(() => ({ success: false }))
  if (!sent.success) {
    await c.updateOne({ id: challengeId }, { $set: { consumed_at: new Date() } })
    return { ok: false, reason: 'send_failed' }
  }
  return { ok: true, challengeId }
}

/**
 * Check a code. Each call counts as an attempt (counted atomically before
 * the comparison); a correct code is consumed so it works once.
 */
export async function verifyFaceEmailCode(challengeId: string, uid: string, code: unknown): Promise<EmailCodeCheck> {
  const c = await codes()
  const before = await c.findOneAndUpdate(
    { id: challengeId, user_id: uid, purpose: 'face_sign_in' },
    { $inc: { attempts: 1 } },
    { returnDocument: 'before' },
  )
  const result = checkEmailCode(before, code, await codeKey(), challengeId)
  if (!result.ok) return result
  const consumed = await c.updateOne({ id: challengeId, consumed_at: null }, { $set: { consumed_at: new Date() } })
  return consumed.modifiedCount === 1 ? { ok: true } : { ok: false, reason: 'used' }
}
