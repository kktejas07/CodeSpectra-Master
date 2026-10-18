/**
 * Face sign-in: next-step decision, trusted-device cookie signing, emailed
 * code hashing / expiry / attempts, and the liveness + frame checks.
 * (lib/auth-trusted-device.ts, lib/auth-email-code.ts, lib/auth-face-liveness.ts)
 *
 * Run: npx vitest run tests/face-sign-in.test.ts
 */
import { describe, expect, it } from 'vitest'
import { TextEncoder as NodeTextEncoder } from 'node:util'

// Under jsdom, TextEncoder returns a Node-realm Uint8Array while jose checks
// against the jsdom-realm global — re-wrap so the HS256 key is accepted.
const nodeEncoder = new NodeTextEncoder()
globalThis.TextEncoder = class {
  readonly encoding = 'utf-8'
  encode(input?: string) {
    return new Uint8Array(nodeEncoder.encode(input))
  }
} as unknown as typeof TextEncoder
import { SignJWT } from 'jose'
import {
  devicesToEvict,
  faceSignInAllowed,
  faceSignInNextStep,
  signDeviceCookie,
  userAgentSummary,
  verifyDeviceCookie,
} from '@/lib/auth-trusted-device'
import {
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_TTL_MS,
  checkEmailCode,
  generateEmailCode,
  hashEmailCode,
} from '@/lib/auth-email-code'
import {
  createLivenessTracker,
  eyeAspectRatio,
  matchAllFrames,
  parseLivenessClaim,
  pickLivenessChallenge,
} from '@/lib/auth-face-liveness'

const key = new Uint8Array(32).fill(7)
const otherKey = new Uint8Array(32).fill(9)

describe('faceSignInNextStep', () => {
  it('new device always needs the emailed code first, with or without 2FA', () => {
    expect(faceSignInNextStep({ trustedDevice: false, totpEnabled: false })).toBe('email_code')
    expect(faceSignInNextStep({ trustedDevice: false, totpEnabled: true })).toBe('email_code')
  })
  it('trusted device: session, unless the account has an authenticator app', () => {
    expect(faceSignInNextStep({ trustedDevice: true, totpEnabled: false })).toBe('session')
    expect(faceSignInNextStep({ trustedDevice: true, totpEnabled: true })).toBe('totp')
  })
  it('after the emailed code: 2FA accounts still enter their code', () => {
    expect(faceSignInNextStep({ trustedDevice: false, totpEnabled: false, emailCodeVerified: true })).toBe('session')
    expect(faceSignInNextStep({ trustedDevice: false, totpEnabled: true, emailCodeVerified: true })).toBe('totp')
  })
})

describe('faceSignInAllowed', () => {
  const template = Array.from({ length: 128 }, () => 0.1)
  it('needs an enrolled template and not turned off; 2FA is not required', () => {
    expect(faceSignInAllowed({ facial_biometric_template: template })).toBe(true)
    expect(faceSignInAllowed({ facial_biometric_template: template, face_login_disabled: true })).toBe(false)
    expect(faceSignInAllowed({})).toBe(false)
    expect(faceSignInAllowed(null)).toBe(false)
  })
})

describe('trusted-device cookie', () => {
  it('round-trips for the same user', async () => {
    const t = await signDeviceCookie('u1', 'dev-abc', key)
    expect(await verifyDeviceCookie(t, key, 'u1')).toEqual({ uid: 'u1', deviceId: 'dev-abc' })
  })
  it('is bound to the user id', async () => {
    const t = await signDeviceCookie('u1', 'dev-abc', key)
    expect(await verifyDeviceCookie(t, key, 'u2')).toBeNull()
  })
  it('rejects another key, tampering, garbage and expiry', async () => {
    const t = await signDeviceCookie('u1', 'dev-abc', key)
    expect(await verifyDeviceCookie(t, otherKey, 'u1')).toBeNull()
    const [h, p, s] = t.split('.')
    const forged = Buffer.from(JSON.stringify({ purpose: 'trusted_device', u: 'u2', d: 'dev-abc', exp: 9999999999 })).toString('base64url')
    expect(await verifyDeviceCookie(`${h}.${forged}.${s}`, key, 'u2')).toBeNull()
    expect(await verifyDeviceCookie(`${h}.${p}.x${s}`, key, 'u1')).toBeNull()
    expect(await verifyDeviceCookie('nope', key)).toBeNull()
    expect(await verifyDeviceCookie(undefined, key)).toBeNull()
    const expired = await signDeviceCookie('u1', 'dev-abc', key, -10)
    expect(await verifyDeviceCookie(expired, key, 'u1')).toBeNull()
  })
  it('rejects a token signed for another purpose (e.g. a session JWT)', async () => {
    const session = await new SignJWT({ uid: 'u1', u: 'u1', d: 'dev-abc' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(key)
    expect(await verifyDeviceCookie(session, key, 'u1')).toBeNull()
  })
})

describe('devicesToEvict', () => {
  const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `d${i}`, last_used_at: new Date(2026, 0, i + 1) }))
  it('keeps room for one more within the cap of 10', () => {
    expect(devicesToEvict(mk(9))).toEqual([])
    expect(devicesToEvict(mk(10))).toEqual(['d0'])
    expect(devicesToEvict(mk(12))).toEqual(['d0', 'd1', 'd2'])
  })
})

describe('userAgentSummary', () => {
  it('summarises without storing the raw string', () => {
    expect(userAgentSummary('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36')).toBe('Chrome on Windows')
    expect(userAgentSummary('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iOS')
    expect(userAgentSummary(null)).toBe('Unknown device')
  })
})

describe('emailed sign-in code', () => {
  const id = 'challenge-1'
  const now = new Date('2026-10-19T10:00:00Z')
  const record = (code: string, over: Partial<{ attempts: number; expires_at: Date; consumed_at: Date | null }> = {}) => ({
    code_hash: hashEmailCode(code, key, id),
    expires_at: new Date(now.getTime() + EMAIL_CODE_TTL_MS),
    attempts: 0,
    consumed_at: null,
    ...over,
  })

  it('generates 6 digits', () => {
    for (let i = 0; i < 50; i++) expect(generateEmailCode()).toMatch(/^\d{6}$/)
  })
  it('stores a keyed hash, salted per challenge — never the code', () => {
    const h = hashEmailCode('123456', key, id)
    expect(h).not.toContain('123456')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(hashEmailCode('123456', otherKey, id)).not.toBe(h)
    expect(hashEmailCode('123456', key, 'challenge-2')).not.toBe(h)
  })
  it('accepts the right code', () => {
    expect(checkEmailCode(record('123456'), '123456', key, id, now)).toEqual({ ok: true })
    expect(checkEmailCode(record('123456'), ' 123 456 ', key, id, now)).toEqual({ ok: true })
  })
  it('rejects a wrong or malformed code', () => {
    expect(checkEmailCode(record('123456'), '654321', key, id, now)).toEqual({ ok: false, reason: 'invalid' })
    expect(checkEmailCode(record('123456'), '12345', key, id, now)).toEqual({ ok: false, reason: 'invalid' })
    expect(checkEmailCode(record('123456'), 123456, key, id, now)).toEqual({ ok: false, reason: 'invalid' })
  })
  it('rejects the right code under the wrong challenge or key', () => {
    expect(checkEmailCode(record('123456'), '123456', key, 'other', now).ok).toBe(false)
    expect(checkEmailCode(record('123456'), '123456', otherKey, id, now).ok).toBe(false)
  })
  it('expires after 10 minutes', () => {
    const r = record('123456')
    expect(checkEmailCode(r, '123456', key, id, new Date(now.getTime() + EMAIL_CODE_TTL_MS - 1)).ok).toBe(true)
    expect(checkEmailCode(r, '123456', key, id, new Date(now.getTime() + EMAIL_CODE_TTL_MS))).toEqual({ ok: false, reason: 'expired' })
  })
  it('allows 5 attempts; the 6th is refused even when correct', () => {
    expect(checkEmailCode(record('123456', { attempts: EMAIL_CODE_MAX_ATTEMPTS - 1 }), '123456', key, id, now).ok).toBe(true)
    expect(checkEmailCode(record('123456', { attempts: EMAIL_CODE_MAX_ATTEMPTS }), '123456', key, id, now)).toEqual({ ok: false, reason: 'too_many_attempts' })
  })
  it('works once and not without a record', () => {
    expect(checkEmailCode(record('123456', { consumed_at: now }), '123456', key, id, now)).toEqual({ ok: false, reason: 'used' })
    expect(checkEmailCode(null, '123456', key, id, now)).toEqual({ ok: false, reason: 'missing' })
  })
})

describe('liveness challenge', () => {
  it('picks each challenge', () => {
    expect(pickLivenessChallenge(() => 0)).toBe('blink')
    expect(pickLivenessChallenge(() => 0.5)).toBe('turn_left')
    expect(pickLivenessChallenge(() => 0.999)).toBe('turn_right')
  })
  it('eye aspect ratio drops when the eye closes', () => {
    const open = [{ x: 0, y: 0 }, { x: 1, y: -0.3 }, { x: 2, y: -0.3 }, { x: 3, y: 0 }, { x: 2, y: 0.3 }, { x: 1, y: 0.3 }]
    const shut = open.map((p) => ({ x: p.x, y: p.y / 6 }))
    expect(eyeAspectRatio(open)).toBeCloseTo(0.2, 5)
    expect(eyeAspectRatio(shut)).toBeLessThan(0.05)
  })
  it('blink needs open → closed → open', () => {
    const t = createLivenessTracker('blink')
    expect(t.push({ ear: 0.3, yaw: 0.5 })).toBe(false)
    expect(t.push({ ear: 0.3, yaw: 0.5 })).toBe(false)
    expect(t.push({ ear: 0.12, yaw: 0.5 })).toBe(false)
    expect(t.push({ ear: 0.29, yaw: 0.5 })).toBe(true)
    const still = createLivenessTracker('blink')
    for (let i = 0; i < 20; i++) still.push({ ear: 0.3, yaw: 0.5 })
    expect(still.met).toBe(false)
  })
  it('turn needs centred first, then the asked direction only', () => {
    const left = createLivenessTracker('turn_left')
    expect(left.push({ ear: 0.3, yaw: 0.8 })).toBe(false) // not seen centred yet
    expect(left.push({ ear: 0.3, yaw: 0.5 })).toBe(false)
    expect(left.push({ ear: 0.3, yaw: 0.2 })).toBe(false) // wrong way
    expect(left.push({ ear: 0.3, yaw: 0.75 })).toBe(true)
    const right = createLivenessTracker('turn_right')
    right.push({ ear: 0.3, yaw: 0.5 })
    expect(right.push({ ear: 0.3, yaw: 0.25 })).toBe(true)
  })
})

describe('face frames', () => {
  const base = Array.from({ length: 128 }, (_, i) => Math.sin(i + 1))
  const near = base.map((x, i) => x + (i % 2 ? 0.01 : -0.01))
  const far = base.map((x, i) => (i % 2 ? -x : x))
  const ok = { liveness: { challenge: 'blink', passed: true } }

  it('needs a met, known challenge and 2–4 distinct frames', () => {
    expect(parseLivenessClaim({ ...ok, descriptors: [base, near] })).not.toBeNull()
    expect(parseLivenessClaim({ ...ok, descriptors: [base] })).toBeNull()
    expect(parseLivenessClaim({ ...ok, descriptors: [base, [...base]] })).toBeNull() // replayed frame
    expect(parseLivenessClaim({ liveness: { challenge: 'blink', passed: false }, descriptors: [base, near] })).toBeNull()
    expect(parseLivenessClaim({ liveness: { challenge: 'smile', passed: true }, descriptors: [base, near] })).toBeNull()
    expect(parseLivenessClaim({ descriptors: [base, near] })).toBeNull()
  })
  it('every frame must match the template', () => {
    expect(matchAllFrames([base, near], base).ok).toBe(true)
    expect(matchAllFrames([base, far], base).ok).toBe(false)
  })
})
