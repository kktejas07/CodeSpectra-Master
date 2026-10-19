/**
 * Pure rules for trusted devices and the face sign-in decision.
 *
 * No DB or Next imports so they can be unit-tested directly
 * (tests/face-sign-in.test.ts). The I/O lives in lib/trusted-devices.ts.
 */
import { SignJWT, jwtVerify } from 'jose'
import { randomBytes } from 'node:crypto'

export const TRUSTED_DEVICE_COOKIE = 'cs_trusted_device'
/** A device stays trusted for 180 days after it was last trusted. */
export const TRUSTED_DEVICE_MAX_AGE_SEC = 180 * 24 * 60 * 60
export const MAX_TRUSTED_DEVICES = 10
const PURPOSE = 'trusted_device'

/** Random, unguessable device id carried inside the signed cookie. */
export function newDeviceId(): string {
  return randomBytes(24).toString('base64url')
}

/**
 * Sign the device cookie value. `key` must be a key used only for this
 * purpose (lib/session `deriveServerKey`) so a device token can never be
 * accepted as a session token, and vice versa.
 */
export async function signDeviceCookie(
  uid: string,
  deviceId: string,
  key: Uint8Array,
  maxAgeSec: number = TRUSTED_DEVICE_MAX_AGE_SEC,
): Promise<string> {
  return new SignJWT({ purpose: PURPOSE, u: uid, d: deviceId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + maxAgeSec)
    .sign(key)
}

/**
 * Verify a device cookie: signature, expiry, purpose, and — when given —
 * that it was issued to `expectedUid`. Returns null on any failure.
 */
export async function verifyDeviceCookie(
  token: string | null | undefined,
  key: Uint8Array,
  expectedUid?: string,
): Promise<{ uid: string; deviceId: string } | null> {
  if (!token || typeof token !== 'string') return null
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] })
    if (payload.purpose !== PURPOSE) return null
    const uid = typeof payload.u === 'string' ? payload.u : ''
    const deviceId = typeof payload.d === 'string' ? payload.d : ''
    if (!uid || !deviceId) return null
    if (expectedUid !== undefined && uid !== expectedUid) return null
    return { uid, deviceId }
  } catch {
    return null
  }
}

/** "Chrome on Windows" — a short label for the device list (no raw UA stored). */
export function userAgentSummary(ua: string | null | undefined): string {
  const s = typeof ua === 'string' ? ua : ''
  if (!s) return 'Unknown device'
  const browser =
    /Edg\//.test(s) ? 'Edge'
      : /OPR\/|Opera/.test(s) ? 'Opera'
        : /Firefox\//.test(s) ? 'Firefox'
          : /Chrome\//.test(s) ? 'Chrome'
            : /Safari\//.test(s) ? 'Safari'
              : 'Browser'
  const os =
    /iPhone|iPad|iPod/.test(s) ? 'iOS'
      : /Android/.test(s) ? 'Android'
        : /Windows/.test(s) ? 'Windows'
          : /Mac OS X|Macintosh/.test(s) ? 'macOS'
            : /CrOS/.test(s) ? 'ChromeOS'
              : /Linux/.test(s) ? 'Linux'
                : 'unknown OS'
  return `${browser} on ${os}`
}

/**
 * Which devices to drop so that, after adding one more, at most `max`
 * remain. Least recently used go first.
 */
export function devicesToEvict(
  existing: { id: string; last_used_at?: Date | string | null }[],
  max: number = MAX_TRUSTED_DEVICES,
): string[] {
  const keep = Math.max(0, max - 1)
  if (existing.length <= keep) return []
  const t = (d: { last_used_at?: Date | string | null }) => (d.last_used_at ? new Date(d.last_used_at).getTime() || 0 : 0)
  return [...existing].sort((a, b) => t(a) - t(b)).slice(0, existing.length - keep).map((d) => d.id)
}

// ─── Face sign-in decision ──────────────────────────────────────────────────

export type FaceSignInStep = 'session' | 'totp' | 'email_code'

/**
 * What comes after a matching face (with the liveness check met):
 *
 * - New device (no valid trusted-device cookie for this account) → an
 *   emailed one-time code first, always.
 * - Then, accounts with an authenticator app keep their second step → code.
 * - Otherwise → the session.
 *
 * The face descriptor is computed in the browser, so the face alone never
 * signs anyone in on a device the account hasn't already trusted.
 */
export function faceSignInNextStep(input: {
  trustedDevice: boolean
  totpEnabled: boolean
  emailCodeVerified?: boolean
}): FaceSignInStep {
  if (!input.trustedDevice && !input.emailCodeVerified) return 'email_code'
  if (input.totpEnabled) return 'totp'
  return 'session'
}

/** Face sign-in is available to an active account with an enrolled face that hasn't turned it off. */
export function faceSignInAllowed(user: Record<string, unknown> | null | undefined): boolean {
  if (!user) return false
  if (user.face_login_disabled === true) return false
  const t = user.facial_biometric_template
  // Plain array (legacy) or sealed "v1." string (lib/identity-media.ts).
  return (Array.isArray(t) && t.length === 128) || (typeof t === 'string' && t.startsWith('v1.') && t.length > 40)
}
