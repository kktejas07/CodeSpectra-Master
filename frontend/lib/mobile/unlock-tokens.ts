/**
 * Biometric unlock for the Android app (mobile/capacitor).
 *
 * After a normal sign-in in the app, the user may opt in; the server mints a
 * random device-bound refresh token. The app keeps it in Android Keystore-
 * backed storage and only reads it after a successful fingerprint / face
 * check. Exchanging it (POST /api/mobile/session {action:'unlock'}) sets a
 * fresh session cookie and ROTATES the token. The password is never stored.
 *
 * Revocation: sign-out on the device deletes it; a password change or
 * "sign out everywhere" bumps session_version, which invalidates it; a
 * replayed (already rotated) token revokes that device's token outright.
 * Only the SHA-256 of a token is stored.
 */
import { createHash, randomBytes } from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'

export const UNLOCK_COLLECTION = 'mobile_unlock_tokens'
/** Sliding lifetime per use, and the hard cap from enrolment. */
export const UNLOCK_TTL_MS = 30 * 86_400_000
export const UNLOCK_MAX_AGE_MS = 90 * 86_400_000

export interface UnlockTokenDoc {
  token_hash: string
  prev_hash: string | null
  user_id: string
  device_id: string
  session_version: number
  created_at: Date
  last_used_at: Date | null
  expires_at: Date
}

export type UnlockDecision = 'ok' | 'expired' | 'version_changed'

const DEVICE_ID = /^[A-Za-z0-9_-]{16,64}$/
const TOKEN = /^[A-Za-z0-9_-]{43}$/

export const isDeviceId = (v: unknown): v is string => typeof v === 'string' && DEVICE_ID.test(v)
export const isUnlockToken = (v: unknown): v is string => typeof v === 'string' && TOKEN.test(v)
export const hashUnlockToken = (token: string): string => createHash('sha256').update(token).digest('hex')
export const newUnlockToken = (): string => randomBytes(32).toString('base64url')

/** Pure: may this stored token still unlock, given the user's current session_version? */
export function decideUnlock(doc: Pick<UnlockTokenDoc, 'expires_at' | 'created_at' | 'session_version'>, currentVersion: number | undefined, now = new Date()): UnlockDecision {
  if (doc.expires_at.getTime() <= now.getTime()) return 'expired'
  if (now.getTime() - doc.created_at.getTime() > UNLOCK_MAX_AGE_MS) return 'expired'
  if ((typeof currentVersion === 'number' ? currentVersion : 1) !== doc.session_version) return 'version_changed'
  return 'ok'
}

/** Pure: next expiry after a successful use (sliding, never past the hard cap). */
export function nextExpiry(createdAt: Date, now = new Date()): Date {
  return new Date(Math.min(now.getTime() + UNLOCK_TTL_MS, createdAt.getTime() + UNLOCK_MAX_AGE_MS))
}

let indexed = false
async function col() {
  const c = (await getMongoDb()).collection<UnlockTokenDoc>(UNLOCK_COLLECTION)
  if (!indexed) {
    indexed = true
    await Promise.all([
      c.createIndex({ token_hash: 1 }, { unique: true, name: 'mut_token_hash' }),
      c.createIndex({ prev_hash: 1 }, { name: 'mut_prev_hash', sparse: true }),
      c.createIndex({ user_id: 1, device_id: 1 }, { name: 'mut_user_device' }),
      c.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'mut_ttl' }),
    ]).catch(() => { indexed = false })
  }
  return c
}

/** Mint (or replace) the token for this user + device. Returns the raw token once. */
export async function enrollUnlockToken(userId: string, deviceId: string, sessionVersion: number | undefined, now = new Date()): Promise<string> {
  const c = await col()
  const token = newUnlockToken()
  await c.deleteMany({ user_id: userId, device_id: deviceId })
  await c.insertOne({
    token_hash: hashUnlockToken(token),
    prev_hash: null,
    user_id: userId,
    device_id: deviceId,
    session_version: typeof sessionVersion === 'number' ? sessionVersion : 1,
    created_at: now,
    last_used_at: null,
    expires_at: new Date(now.getTime() + UNLOCK_TTL_MS),
  })
  return token
}

export type RedeemResult =
  | { ok: true; userId: string; doc: UnlockTokenDoc; rotate: () => Promise<string> }
  | { ok: false; reason: 'unknown' | 'reused' | 'device_mismatch' }

/**
 * Look a token up for this device. A token that was already rotated away
 * (replay) revokes the device's current token too. The caller checks the
 * account (decideUnlock) and then calls rotate().
 */
export async function redeemUnlockToken(token: string, deviceId: string): Promise<RedeemResult> {
  const c = await col()
  const hash = hashUnlockToken(token)
  const doc = await c.findOne({ token_hash: hash })
  if (!doc) {
    const reused = await c.findOneAndDelete({ prev_hash: hash })
    return { ok: false, reason: reused ? 'reused' : 'unknown' }
  }
  if (doc.device_id !== deviceId) return { ok: false, reason: 'device_mismatch' }
  return {
    ok: true,
    userId: doc.user_id,
    doc,
    rotate: async () => {
      const next = newUnlockToken()
      const now = new Date()
      // Compare-and-set on the old hash: two concurrent unlocks can't both rotate.
      const r = await c.updateOne(
        { token_hash: hash },
        { $set: { token_hash: hashUnlockToken(next), prev_hash: hash, last_used_at: now, expires_at: nextExpiry(doc.created_at, now) } },
      )
      if (r.modifiedCount !== 1) throw new Error('rotate_conflict')
      return next
    },
  }
}

export async function deleteUnlockToken(hashOrToken: { token?: string; userId?: string; deviceId?: string }): Promise<number> {
  const c = await col()
  if (hashOrToken.token) return (await c.deleteMany({ token_hash: hashUnlockToken(hashOrToken.token) })).deletedCount
  if (hashOrToken.userId && hashOrToken.deviceId) return (await c.deleteMany({ user_id: hashOrToken.userId, device_id: hashOrToken.deviceId })).deletedCount
  return 0
}
