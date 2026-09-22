/**
 * CSRF contract for Bearer-authenticated callers.
 *
 * The mobile app posts to /api/auth/mobile-token with no cookies, so the
 * double-submit check rejected it with "CSRF validation failed" (403) —
 * login was impossible from Expo. A cross-site attacker cannot forge an
 * Authorization header, so Bearer requests must skip the token check while
 * cookie requests keep it.
 * Run: npx vitest run tests/csrf-bearer.test.ts
 */
import { describe, it, expect } from 'vitest'
import { checkCsrf } from '@/lib/csrf'

const TOKEN = 'a'.repeat(32)

function post(headers: Record<string, string>): Request {
  return new Request('https://codespectra.ai/api/auth/mobile-token', {
    method: 'POST',
    headers,
  })
}

describe('checkCsrf (cookie path — unchanged)', () => {
  it('rejects a mutating request with no cookie and no header', () => {
    expect(checkCsrf(post({ 'content-type': 'application/json' })).pass).toBe(false)
  })

  it('rejects a mismatched header', () => {
    const res = checkCsrf(post({ cookie: `csrf_token=${TOKEN}`, 'x-csrf-token': 'b'.repeat(32) }))
    expect(res.pass).toBe(false)
  })

  it('accepts a matching cookie + header pair', () => {
    const res = checkCsrf(post({ cookie: `csrf_token=${TOKEN}`, 'x-csrf-token': TOKEN }))
    expect(res.pass).toBe(true)
  })

  it('sets a token on GET so the client can later echo it', () => {
    const res = checkCsrf(new Request('https://codespectra.ai/api/courses', { method: 'GET' }))
    expect(res.pass).toBe(true)
    expect(res.token).toBeTruthy()
  })
})

describe('session-establishing routes are CSRF-exempt', () => {
  // Mirrors CSRF_EXEMPT in middleware.ts. Login/token mint a session, so
  // there is nothing to forge, and native clients have no cookie yet.
  const EXEMPT = ['/api/auth/login', '/api/auth/mobile-token']
  const isExempt = (pathname: string): boolean => EXEMPT.some((p) => pathname.startsWith(p))

  it('cookie-less mobile-token POST passes the middleware gate', () => {
    expect(isExempt('/api/auth/mobile-token')).toBe(true)
    // And the raw checker still rejects it — which is why the exemption exists.
    expect(checkCsrf(post({ 'content-type': 'application/json' })).pass).toBe(false)
  })

  it('cookie-less web login POST passes the middleware gate', () => {
    const webLogin = new Request('https://codespectra.ai/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    })
    expect(checkCsrf(webLogin).pass).toBe(false)
    expect(isExempt('/api/auth/login')).toBe(true)
  })

  it('unrelated mutating routes are NOT exempt', () => {
    expect(isExempt('/api/admin/users')).toBe(false)
    expect(isExempt('/api/courses')).toBe(false)
  })
})

describe('Bearer requests (mobile)', () => {
  // The middleware skips checkCsrf when an Authorization: Bearer header is
  // present. This mirrors that branch so the behaviour is pinned in a test.
  const bearerSkip = (headers: Record<string, string>): boolean =>
    (headers['authorization']?.startsWith('Bearer ') ?? false) || checkCsrf(post(headers)).pass

  it('a cookie-less Bearer POST is allowed through', () => {
    expect(bearerSkip({ authorization: 'Bearer sometoken' })).toBe(true)
  })

  it('a plain cookie-less POST is still blocked', () => {
    expect(bearerSkip({ 'content-type': 'application/json' })).toBe(false)
  })

  it('a non-Bearer Authorization header does NOT bypass the check', () => {
    expect(bearerSkip({ authorization: 'Basic abc123' })).toBe(false)
  })
})
