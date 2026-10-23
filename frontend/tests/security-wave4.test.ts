/**
 * Security wave 4 — auth linking, GitHub connect binding, client IP trust,
 * request guards (login CSRF / impersonation / bearer CSRF / page gate),
 * re-auth, newsletter tokens, KYC webhook rules, Anon Aadhaar binding,
 * legacy-key decryption and admin 2FA on the API.
 * Run: npx vitest run tests/security-wave4.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import bcrypt from 'bcryptjs'

// ─── SEC-021: client IP ─────────────────────────────────────────────────────
import {
  isAutoBlockableIp,
  normalizeIp,
  parseCidrs,
  resolveClientIp,
  ipInNets,
} from '@/lib/client-ip'

const H = (h: Record<string, string>) => new Headers(h)

describe('client IP (SEC-021)', () => {
  const nets = parseCidrs('10.0.0.0/8, 172.16.0.0/12, ::1')

  it('ignores every forwarding header when the peer is not a trusted proxy', () => {
    const h = H({ 'x-codespectra-peer': '203.0.113.7', 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8', 'cf-connecting-ip': '9.9.9.9' })
    expect(resolveClientIp(h, { nets, trustCf: true, peerHeaderTrusted: true })).toBe('203.0.113.7')
  })

  it('default (no TRUSTED_PROXY_CIDRS) → socket address, so spoofed headers rotate nothing', () => {
    const a = resolveClientIp(H({ 'x-codespectra-peer': '198.51.100.1', 'cf-connecting-ip': '1.1.1.1' }), { nets: [], trustCf: true, peerHeaderTrusted: true })
    const b = resolveClientIp(H({ 'x-codespectra-peer': '198.51.100.1', 'cf-connecting-ip': '2.2.2.2' }), { nets: [], trustCf: true, peerHeaderTrusted: true })
    expect(a).toBe('198.51.100.1')
    expect(b).toBe(a)
  })

  it('walks X-Forwarded-For right-to-left from a trusted proxy', () => {
    const h = H({ 'x-codespectra-peer': '172.18.0.2', 'x-forwarded-for': '6.6.6.6, 198.51.100.9, 10.0.0.5' })
    expect(resolveClientIp(h, { nets, trustCf: false, peerHeaderTrusted: true })).toBe('198.51.100.9')
  })

  it('uses X-Real-IP from a trusted proxy when there is no XFF', () => {
    const h = H({ 'x-codespectra-peer': '10.1.1.1', 'x-real-ip': '198.51.100.10' })
    expect(resolveClientIp(h, { nets, trustCf: false, peerHeaderTrusted: true })).toBe('198.51.100.10')
  })

  it('CF-Connecting-IP only when explicitly trusted', () => {
    const h = H({ 'x-codespectra-peer': '10.1.1.1', 'cf-connecting-ip': '198.51.100.11', 'x-forwarded-for': '198.51.100.12' })
    expect(resolveClientIp(h, { nets, trustCf: false, peerHeaderTrusted: true })).toBe('198.51.100.12')
    expect(resolveClientIp(h, { nets, trustCf: true, peerHeaderTrusted: true })).toBe('198.51.100.11')
  })

  it('without our server the peer header is ignored and the right-most XFF hop is the peer', () => {
    const forged = H({ 'x-codespectra-peer': '10.0.0.1', 'x-forwarded-for': '1.2.3.4, 203.0.113.50', 'cf-connecting-ip': '8.8.8.8' })
    expect(resolveClientIp(forged, { nets: [], trustCf: true, peerHeaderTrusted: false })).toBe('203.0.113.50')
    expect(resolveClientIp(H({}), { nets: [], peerHeaderTrusted: false })).toBe('unknown')
  })

  it('parses v4, v6, mapped and ports', () => {
    expect(normalizeIp('::ffff:192.0.2.1')).toBe('192.0.2.1')
    expect(normalizeIp('192.0.2.1:443')).toBe('192.0.2.1')
    expect(normalizeIp('[2001:db8::1]:8080')).toBe('2001:db8::1')
    expect(normalizeIp('not-an-ip')).toBeNull()
    expect(ipInNets('2001:db8::5', parseCidrs('2001:db8::/32'))).toBe(true)
    expect(ipInNets('2001:db9::5', parseCidrs('2001:db8::/32'))).toBe(false)
    expect(ipInNets('172.31.255.255', parseCidrs('172.16.0.0/12'))).toBe(true)
    expect(ipInNets('172.32.0.0', parseCidrs('172.16.0.0/12'))).toBe(false)
  })

  it('never auto-blocks unknown, private, loopback or proxy addresses', () => {
    expect(isAutoBlockableIp('unknown')).toBe(false)
    expect(isAutoBlockableIp('10.0.0.8')).toBe(false)
    expect(isAutoBlockableIp('127.0.0.1')).toBe(false)
    expect(isAutoBlockableIp('::1')).toBe(false)
    expect(isAutoBlockableIp('203.0.113.9', parseCidrs('203.0.113.0/24'))).toBe(false)
    expect(isAutoBlockableIp('198.51.100.20', [])).toBe(true)
  })
})

// ─── SEC-006: OAuth linking + email verification policy ─────────────────────
import { credentialResetUpdate, oauthLinkDecision } from '@/lib/auth-linking'
import { signInBlock } from '@/lib/auth-policy'
import { GENERAL_PLATFORM_DEFAULTS } from '@/lib/platform-general-settings'

describe('Google/GitHub linking to an existing account (SEC-006)', () => {
  it('refuses when the provider did not verify the email', () => {
    expect(oauthLinkDecision({ emailVerified: true }, false)).toBe('conflict')
  })
  it('links a verified account as before', () => {
    expect(oauthLinkDecision({ emailVerified: true }, true)).toBe('link')
  })
  it('resets credentials before linking an unverified (possibly pre-registered) account', () => {
    expect(oauthLinkDecision({ emailVerified: false }, true)).toBe('link_after_reset')
    expect(oauthLinkDecision({}, true)).toBe('link_after_reset')
    const u = credentialResetUpdate('fb-uid', new Date('2026-01-01'))
    expect(u.$set).toMatchObject({ firebase_uid: 'fb-uid', emailVerified: true })
    for (const f of ['passwordHash', 'totp_secret', 'totp_enabled', 'facial_biometric_template', 'reset_token_hash']) {
      expect(u.$unset).toHaveProperty(f)
    }
  })
})

describe('email verification default-on with grandfathering (SEC-006)', () => {
  const policy = { allow_registration: true, maintenance_mode: false, require_email_verification: GENERAL_PLATFORM_DEFAULTS.require_email_verification }
  it('is on by default', () => {
    expect(GENERAL_PLATFORM_DEFAULTS.require_email_verification).toBe(true)
  })
  it('blocks new unverified signups', () => {
    expect(signInBlock(policy, { role: 'user', emailVerified: false, email_verification_required: true })?.code).toBe('email_unverified')
  })
  it('lets legacy accounts (no marker) and verified accounts sign in', () => {
    expect(signInBlock(policy, { role: 'user', emailVerified: false })).toBeNull()
    expect(signInBlock(policy, { role: 'user', emailVerified: true, email_verification_required: true })).toBeNull()
  })
})

// ─── SEC-007: GitHub connect binding ────────────────────────────────────────
import { checkGithubCallbackBinding, newPkcePair, pkceChallenge } from '@/lib/github-oauth-state'

describe('GitHub connect state binding (SEC-007)', () => {
  const now = Date.parse('2026-10-19T10:00:00Z')
  const row = { state: 's1', user_id: 'attacker', created_at: new Date(now - 60_000).toISOString() }

  it('rejects a callback opened by a different signed-in user (the attack)', () => {
    const r = checkGithubCallbackBinding({ state: 's1', stateRow: row, cookie: null, userId: 'victim', now })
    expect(r).toEqual({ ok: false, reason: 'browser_mismatch' })
    const r2 = checkGithubCallbackBinding({ state: 's1', stateRow: row, cookie: { state: 's1', uid: 'attacker' }, userId: 'victim', now })
    expect(r2).toEqual({ ok: false, reason: 'user_mismatch' })
  })
  it('requires a signed-in user, fresh state and matching cookie', () => {
    expect(checkGithubCallbackBinding({ state: 's1', stateRow: row, cookie: { state: 's1', uid: 'attacker' }, userId: null, now })).toEqual({ ok: false, reason: 'not_signed_in' })
    expect(checkGithubCallbackBinding({ state: 's1', stateRow: { ...row, created_at: new Date(now - 11 * 60_000).toISOString() }, cookie: { state: 's1', uid: 'attacker' }, userId: 'attacker', now })).toEqual({ ok: false, reason: 'expired' })
    expect(checkGithubCallbackBinding({ state: 's2', stateRow: null, cookie: { state: 's2', uid: 'attacker' }, userId: 'attacker', now })).toEqual({ ok: false, reason: 'invalid_state' })
    expect(checkGithubCallbackBinding({ state: 's1', stateRow: row, cookie: { state: 's1', uid: 'attacker' }, userId: 'attacker', now })).toEqual({ ok: true })
  })
  it('PKCE S256 challenge matches RFC 7636 test vector', () => {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
    const p = newPkcePair()
    expect(pkceChallenge(p.verifier)).toBe(p.challenge)
  })
})

// ─── Request guards: SEC-010 / SEC-012 / SEC-016 / SEC-025 ──────────────────
import {
  bearerSkipsCsrf,
  impersonationBlocked,
  impersonatorOfToken,
  isPageRequestPath,
  loginCsrfBlocked,
} from '@/lib/request-guards'

function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`
}

describe('request guards', () => {
  it('SEC-012: sign-in endpoints refuse non-JSON and cross-site posts', () => {
    expect(loginCsrfBlocked('POST', '/api/auth/login', H({ 'content-type': 'text/plain' }))).toBe(true)
    expect(loginCsrfBlocked('POST', '/api/auth/login', H({ 'content-type': 'application/x-www-form-urlencoded' }))).toBe(true)
    expect(loginCsrfBlocked('POST', '/api/auth/login', H({ 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' }))).toBe(true)
    expect(loginCsrfBlocked('POST', '/api/auth/login', H({ 'content-type': 'application/json; charset=utf-8', 'sec-fetch-site': 'same-origin' }))).toBe(false)
    expect(loginCsrfBlocked('POST', '/api/auth/mobile-token', H({ 'content-type': 'application/json' }))).toBe(false)
    expect(loginCsrfBlocked('POST', '/api/auth/login-method', H({ 'content-type': 'text/plain' }))).toBe(false)
  })

  it('SEC-025: a junk Bearer header does not skip CSRF when a session cookie is present', () => {
    expect(bearerSkipsCsrf(H({ authorization: 'Bearer junk' }), true)).toBe(false)
    expect(bearerSkipsCsrf(H({ authorization: 'Bearer token' }), false)).toBe(true)
    expect(bearerSkipsCsrf(H({}), false)).toBe(false)
  })

  it('SEC-016: dotted dynamic segments are pages; real assets are not', () => {
    expect(isPageRequestPath('/dashboard/exams/a.b')).toBe(true)
    expect(isPageRequestPath('/dashboard/user.name/profile')).toBe(true)
    expect(isPageRequestPath('/robots.txt')).toBe(false)
    expect(isPageRequestPath('/logo.png')).toBe(false)
    expect(isPageRequestPath('/api/x')).toBe(false)
  })

  it('SEC-010: impersonated sessions cannot change credentials or move money', () => {
    const imp = fakeJwt({ uid: 'u1', imp: 'admin1' })
    const normal = fakeJwt({ uid: 'u1' })
    expect(impersonatorOfToken(imp)).toBe('admin1')
    expect(impersonatorOfToken(normal)).toBeNull()
    expect(impersonationBlocked('POST', '/api/user/email-change/request', imp)).toBe(true)
    expect(impersonationBlocked('POST', '/api/user/delete-account', imp)).toBe(true)
    expect(impersonationBlocked('POST', '/api/billing/checkout', imp)).toBe(true)
    expect(impersonationBlocked('POST', '/api/marketplace/seller/payouts', imp)).toBe(true)
    expect(impersonationBlocked('GET', '/api/user/2fa/status', imp)).toBe(false)
    expect(impersonationBlocked('POST', '/api/admin/impersonate/stop', imp)).toBe(false)
    expect(impersonationBlocked('POST', '/api/user/email-change/request', normal)).toBe(false)
    expect(impersonationBlocked('POST', '/api/courses', imp)).toBe(false)
  })

  it('SEC-039: view-as never upgrades a plan, buys, or refunds', () => {
    const imp = fakeJwt({ uid: 'u1', imp: 'admin1' })
    const normal = fakeJwt({ uid: 'u1' })
    for (const p of [
      '/api/billing/change-plan', '/api/billing/verify', '/api/billing/anything-new',
      '/api/pro-certs/aws-saa/checkout', '/api/licences', '/api/licences/l1/seats',
      '/api/marketplace/orders/o1/refund', '/api/marketplace/orders/o1/cancel', '/api/marketplace/seller/refunds',
    ]) {
      expect(impersonationBlocked('POST', p, imp), p).toBe(true)
      expect(impersonationBlocked('POST', p, normal), p).toBe(false)
    }
    expect(impersonationBlocked('PATCH', '/api/licences/l1', imp)).toBe(true)
    expect(impersonationBlocked('GET', '/api/billing/invoices', imp)).toBe(false)
    expect(impersonationBlocked('GET', '/api/marketplace/orders/o1', imp)).toBe(false)
    expect(impersonationBlocked('POST', '/api/billing/stripe-webhook', imp)).toBe(false)
    expect(impersonationBlocked('POST', '/api/pro-certs/webhooks/stripe', imp)).toBe(false)
  })
})

// ─── SEC-008 / SEC-011: re-authentication ───────────────────────────────────
import { recentlySignedIn, reauthMethod, verifyReauth } from '@/lib/reauth'

describe('re-authentication (SEC-008 / SEC-011)', () => {
  it('picks password, then authenticator, then recent real sign-in', () => {
    expect(reauthMethod({ passwordHash: 'x' })).toBe('password')
    expect(reauthMethod({ totp_enabled: true, totp_secret: 's' })).toBe('code')
    expect(reauthMethod({})).toBe('recent_sign_in')
  })
  it('only reauth_at counts as a recent sign-in (lastLoginAt is ignored)', () => {
    const now = Date.now()
    expect(recentlySignedIn({ reauth_at: new Date(now - 60_000) }, now)).toBe(true)
    expect(recentlySignedIn({ reauth_at: new Date(now - 16 * 60_000) }, now)).toBe(false)
    expect(recentlySignedIn({ lastLoginAt: new Date(now) } as never, now)).toBe(false)
  })
  it('checks the password and refuses impersonated sessions', async () => {
    const passwordHash = await bcrypt.hash('correct horse', 4)
    expect((await verifyReauth({ passwordHash }, { password: 'correct horse' })).ok).toBe(true)
    const bad = await verifyReauth({ passwordHash }, { password: 'nope' })
    expect(bad.ok).toBe(false)
    const imp = await verifyReauth({ passwordHash }, { password: 'correct horse' }, { impersonating: true })
    expect(imp.ok).toBe(false)
  })
})

// ─── SEC-019: newsletter tokens ─────────────────────────────────────────────
import { newsletterTokenMatches, newsletterTokenWithKey } from '@/lib/newsletter-token'

describe('newsletter unsubscribe token (SEC-019)', () => {
  const key = new Uint8Array(32).fill(7)
  it('round-trips, is case-insensitive on email and rejects others', () => {
    const t = newsletterTokenWithKey(key, 'A@x.com')
    expect(newsletterTokenMatches(key, 'a@x.com', t)).toBe(true)
    expect(newsletterTokenMatches(key, 'b@x.com', t)).toBe(false)
    expect(newsletterTokenMatches(new Uint8Array(32).fill(8), 'a@x.com', t)).toBe(false)
    expect(newsletterTokenMatches(key, 'a@x.com', 'zz')).toBe(false)
  })
})

// ─── SEC-020: Didit webhook rules ───────────────────────────────────────────
import { bodyTimestampFresh, kycTransitionAllowed, mapDiditStatus } from '@/lib/kyc-webhook-rules'

describe('KYC webhook replay rules (SEC-020)', () => {
  it('checks the signed body timestamp', () => {
    const now = 1_800_000_000
    expect(bodyTimestampFresh({ timestamp: now - 10 }, now)).toBe(true)
    expect(bodyTimestampFresh({ timestamp: now - 3600 }, now)).toBe(false)
    expect(bodyTimestampFresh({}, now)).toBeNull()
  })
  it('never moves a session out of a final or manual decision', () => {
    expect(kycTransitionAllowed({ status: 'rejected' }, mapDiditStatus('Approved'))).toBe(false)
    expect(kycTransitionAllowed({ status: 'approved' }, 'rejected')).toBe(false)
    expect(kycTransitionAllowed({ status: 'manual_review', reviewed_by: 'admin' }, 'approved')).toBe(false)
    expect(kycTransitionAllowed({ status: 'manual_review' }, 'approved')).toBe(true)
    expect(kycTransitionAllowed({ status: 'pending' }, 'rejected')).toBe(true)
    expect(kycTransitionAllowed(null, 'approved')).toBe(true)
  })
})

// ─── SEC-026: Anon Aadhaar binding ──────────────────────────────────────────
import { anonAadhaarSignal, anonAadhaarSignalHash, checkAnonAadhaarBinding, normalizeNullifierSeed } from '@/lib/anon-aadhaar-binding'

describe('Anon Aadhaar binding (SEC-026)', () => {
  it('derives a per-user signal and hash', async () => {
    expect(anonAadhaarSignal('u1')).not.toBe(anonAadhaarSignal('u2'))
    const h1 = await anonAadhaarSignalHash(anonAadhaarSignal('u1'))
    expect(h1).toMatch(/^\d+$/)
    expect(await anonAadhaarSignalHash(anonAadhaarSignal('u1'))).toBe(h1)
  })
  it('requires the seed, the user binding, and no test mode in production', () => {
    const base = { proofSeed: '314159265358979', cfgSeed: '314159265358979', proofSignalHash: 'H', expectedSignalHash: 'H', testMode: false, production: true }
    expect(checkAnonAadhaarBinding(base)).toBeNull()
    expect(checkAnonAadhaarBinding({ ...base, proofSeed: undefined })).toBe('seed_mismatch')
    expect(checkAnonAadhaarBinding({ ...base, proofSeed: '1' })).toBe('seed_mismatch')
    expect(checkAnonAadhaarBinding({ ...base, proofSignalHash: 'other' })).toBe('signal_mismatch')
    expect(checkAnonAadhaarBinding({ ...base, testMode: true })).toBe('test_mode_in_production')
    expect(checkAnonAadhaarBinding({ ...base, testMode: true, production: false })).toBeNull()
    expect(normalizeNullifierSeed('1234567890123456789')).toBe(normalizeNullifierSeed('123456789012345'))
  })
})

// ─── SEC-018: legacy key stays readable ─────────────────────────────────────
import { decryptSecretValue, encryptSecretValue, encryptionKeyProblems, legacySecretsKey, secretsEncryptionKey } from '@/lib/secrets-crypto'

describe('secrets at rest (SEC-018)', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })
  it('values sealed with the session-derived key decrypt after SECRETS_ENCRYPTION_KEY is set', () => {
    process.env.SESSION_SECRET_BOOT = 's'.repeat(40)
    delete process.env.SECRETS_ENCRYPTION_KEY
    const legacy = legacySecretsKey()!
    const box = encryptSecretValue('sk-live-123', legacy)
    process.env.SECRETS_ENCRYPTION_KEY = 'k'.repeat(40)
    const primary = secretsEncryptionKey()!
    expect(primary.equals(legacy)).toBe(false)
    expect(decryptSecretValue(box, primary)).toBe('sk-live-123')
  })
  it('reports missing production keys', () => {
    expect(encryptionKeyProblems({} as NodeJS.ProcessEnv).length).toBe(2)
    expect(encryptionKeyProblems({ SECRETS_ENCRYPTION_KEY: 'k'.repeat(32) } as unknown as NodeJS.ProcessEnv)).toEqual([])
  })
})

// ─── SEC-015: codeathon sponsors visibility ─────────────────────────────────
import { codeathonPubliclyVisible } from '@/lib/codeathon-visibility'

describe('codeathon visibility (SEC-015 / A-044)', () => {
  it('hides drafts and unpublished events', () => {
    expect(codeathonPubliclyVisible({ status: 'draft' })).toBe(false)
    expect(codeathonPubliclyVisible({ status: 'upcoming', published: false })).toBe(false)
    expect(codeathonPubliclyVisible({ status: 'upcoming' })).toBe(true)
    expect(codeathonPubliclyVisible(null)).toBe(false)
  })
})

// ─── SEC-009 / A-041: admin 2FA on the API ──────────────────────────────────
describe('admin 2FA enforced on admin API calls (SEC-009)', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.doUnmock('@/lib/admin-2fa')
  })
  it('blocks after the grace period', async () => {
    vi.doMock('@/lib/admin-2fa', () => ({ getAdmin2faState: async () => ({ status: 'required' }) }))
    const { admin2faApiBlock } = await import('@/lib/route-auth')
    expect(await admin2faApiBlock({ id: 'a1', role: 'superadmin' })).toMatchObject({ status: 403, code: 'admin_2fa_required' })
  })
  it('allows during the grace period and when 2FA is on', async () => {
    vi.doMock('@/lib/admin-2fa', () => ({ getAdmin2faState: async () => ({ status: 'grace', daysLeft: 3 }) }))
    const { admin2faApiBlock } = await import('@/lib/route-auth')
    expect(await admin2faApiBlock({ id: 'a1', role: 'tenant_admin' })).toBeNull()
  })
})
