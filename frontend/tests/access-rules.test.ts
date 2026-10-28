/**
 * Pure access rules: cron auth, page/feature access, SSRF address blocking,
 * AI credit costs. Run: npx vitest run tests/access-rules.test.ts
 */
import { describe, it, expect } from 'vitest'
import { decideCronAuth, bearerToken, cronSecretMatches } from '@/lib/cron-auth'
import { decidePageAccess, routeCovers, isRouteLocked } from '@/lib/page-access'
import { isBlockedAddress } from '@/lib/url-safety'
import { aiCreditCost, AI_CREDIT_COSTS } from '@/lib/entitlements-core'
import type { ResourcePermission } from '@/lib/permissions-db'

describe('cron auth', () => {
  it('accepts only a matching Bearer header', () => {
    expect(decideCronAuth({ secret: 's3cret', authorization: 'Bearer s3cret', nodeEnv: 'production' })).toBe(true)
    expect(decideCronAuth({ secret: 's3cret', authorization: 'bearer s3cret', nodeEnv: 'production' })).toBe(true)
    expect(decideCronAuth({ secret: 's3cret', authorization: 'Bearer wrong', nodeEnv: 'production' })).toBe(false)
    expect(decideCronAuth({ secret: 's3cret', authorization: 's3cret', nodeEnv: 'production' })).toBe(false)
    expect(decideCronAuth({ secret: 's3cret', authorization: null, nodeEnv: 'production' })).toBe(false)
  })
  it('denies in production when no secret is configured', () => {
    expect(decideCronAuth({ secret: '', authorization: null, nodeEnv: 'production' })).toBe(false)
    expect(decideCronAuth({ secret: undefined, authorization: 'Bearer x', nodeEnv: 'production' })).toBe(false)
  })
  it('allows dev without a secret only when the route permits it', () => {
    expect(decideCronAuth({ secret: '', authorization: null, nodeEnv: 'development' })).toBe(true)
    expect(decideCronAuth({ secret: '', authorization: null, nodeEnv: 'development', allowDevWithoutSecret: false })).toBe(false)
  })
  it('compares in constant time without throwing on length mismatch', () => {
    expect(cronSecretMatches('abc', 'abcd')).toBe(false)
    expect(cronSecretMatches('abc', '')).toBe(false)
    expect(bearerToken('Bearer  tok ')).toBe('tok')
    expect(bearerToken('Basic tok')).toBe('')
  })
})

describe('page access', () => {
  const perms: ResourcePermission[] = [
    { resource: '/dashboard/mock-tests', resourceType: 'page', actions: ['read'] },
    { resource: '/dashboard/scanner', resourceType: 'page', actions: [] },
  ]
  const base = { lockedPages: [] as string[], lockedFeatures: [] as string[], permissions: perms }

  it('matches routes by segment', () => {
    expect(routeCovers('/dashboard/scanner', '/dashboard/scanner/github')).toBe(true)
    expect(routeCovers('/dashboard/scanner', '/dashboard/scanners')).toBe(false)
    expect(isRouteLocked('/dashboard/mock-tests/abc', ['/dashboard/mock-tests'])).toBe(true)
  })
  it('denies a missing role, a locked page, a locked feature, or a page without read', () => {
    expect(decidePageAccess({ ...base, role: null, route: '/dashboard/mock-tests' })).toEqual({ ok: false, reason: 'forbidden' })
    expect(decidePageAccess({ ...base, role: 'user', route: '/dashboard/mock-tests', lockedPages: ['/dashboard/mock-tests'] }))
      .toEqual({ ok: false, reason: 'locked' })
    expect(decidePageAccess({ ...base, role: 'user', route: '/dashboard/mock-tests', feature: 'x:y', lockedFeatures: ['x:y'] }))
      .toEqual({ ok: false, reason: 'locked' })
    expect(decidePageAccess({ ...base, role: 'user', route: '/dashboard/scanner' })).toEqual({ ok: false, reason: 'forbidden' })
    expect(decidePageAccess({ ...base, role: 'user', route: '/dashboard/unknown' })).toEqual({ ok: false, reason: 'forbidden' })
  })
  it('allows a readable, unlocked page; superadmin bypasses locks', () => {
    expect(decidePageAccess({ ...base, role: 'user', route: '/dashboard/mock-tests' })).toEqual({ ok: true })
    expect(decidePageAccess({ ...base, role: 'superadmin', route: '/dashboard/scanner', lockedPages: ['/dashboard/scanner'] })).toEqual({ ok: true })
  })
})

describe('SSRF address blocking', () => {
  it.each(['127.0.0.1', '127.1.2.3', '10.0.0.5', '172.20.1.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:169.254.169.254'])(
    'blocks %s', (a) => expect(isBlockedAddress(a)).toBe(true),
  )
  it.each(['8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700::1111'])('allows %s', (a) => expect(isBlockedAddress(a)).toBe(false))
})

describe('AI credit costs', () => {
  it('has a positive integer cost for every feature and never 0 for unknown ones', () => {
    for (const v of Object.values(AI_CREDIT_COSTS)) expect(Number.isInteger(v) && v >= 1).toBe(true)
    expect(aiCreditCost('mock_interview')).toBe(AI_CREDIT_COSTS.mock_interview)
    expect(aiCreditCost('does-not-exist')).toBe(1)
  })
})
