/**
 * Account / session / tenant-access rules (lib/auth-account.ts) and the
 * session-token checks that use them (lib/session.ts, lib/route-auth.ts).
 *
 * Run: npx vitest run tests/auth-account.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
import {
  accountBlockReason,
  allowedBadgeVariant,
  canAdministerTenant,
  existingAccountInviteAction,
  isSessionVersionCurrent,
  issuedAfterRevocation,
  loginBackoffMs,
  passwordProblem,
  resolveAccount,
  stripUserSecrets,
  tenantFilter,
  tenantScope,
} from '@/lib/auth-account'

describe('resolveAccount — role and status come from the DB profile', () => {
  it('missing profile (deleted account) is refused', () => {
    expect(resolveAccount(null)).toEqual({ ok: false, reason: 'missing' })
  })

  it('deactivated accounts are refused', () => {
    expect(resolveAccount({ role: 'superadmin', status: 'inactive' })).toEqual({ ok: false, reason: 'inactive' })
    expect(resolveAccount({ role: 'user', isActive: false })).toEqual({ ok: false, reason: 'inactive' })
    expect(accountBlockReason({ role: 'user', status: 'active' })).toBeNull()
  })

  it('a demoted superadmin runs as user (no token role fallback)', () => {
    expect(resolveAccount({ role: 'user' })).toEqual({ ok: true, role: 'user', tenantId: null })
  })

  it('tenant_admin without a tenant runs as user', () => {
    expect(resolveAccount({ role: 'tenant_admin' })).toMatchObject({ ok: true, role: 'user' })
    expect(resolveAccount({ role: 'admin', tenantId: '' })).toMatchObject({ ok: true, role: 'user' })
  })

  it('tenant_admin of a suspended tenant runs as user', () => {
    expect(resolveAccount({ role: 'tenant_admin', tenantId: 't1' }, { tenantActive: false })).toMatchObject({ role: 'user', tenantId: 't1' })
    expect(resolveAccount({ role: 'tenant_admin', tenantId: 't1' }, { tenantActive: true })).toEqual({ ok: true, role: 'tenant_admin', tenantId: 't1' })
  })

  it('legacy organizationId counts as the tenant', () => {
    expect(resolveAccount({ role: 'tenant_admin', organizationId: 'o1' })).toEqual({ ok: true, role: 'tenant_admin', tenantId: 'o1' })
  })
})

describe('session revocation checks', () => {
  it('session_version must match; unversioned tokens count as 1', () => {
    expect(isSessionVersionCurrent(1, { session_version: 1 })).toBe(true)
    expect(isSessionVersionCurrent(undefined, {})).toBe(true)
    expect(isSessionVersionCurrent(undefined, { session_version: 2 })).toBe(false)
    expect(isSessionVersionCurrent(1, { session_version: 2 })).toBe(false)
    expect(isSessionVersionCurrent(1, null)).toBe(false)
  })

  it('Firebase credentials issued before sessions_revoked_at are refused', () => {
    const revoked = new Date('2026-10-01T12:00:00Z')
    const before = Math.floor(new Date('2026-10-01T11:00:00Z').getTime() / 1000)
    const after = Math.floor(new Date('2026-10-01T13:00:00Z').getTime() / 1000)
    expect(issuedAfterRevocation(before, { sessions_revoked_at: revoked })).toBe(false)
    expect(issuedAfterRevocation(after, { sessions_revoked_at: revoked })).toBe(true)
    expect(issuedAfterRevocation(before, {})).toBe(true)
    expect(issuedAfterRevocation(after, null)).toBe(false)
  })
})

describe('tenant access helper', () => {
  it('superadmin sees all; tenant_admin sees own; anyone else nothing', () => {
    expect(tenantScope({ role: 'superadmin' })).toEqual({ kind: 'all' })
    expect(tenantScope({ role: 'tenant_admin', tenantId: 't1' })).toEqual({ kind: 'tenant', tenantId: 't1' })
    expect(tenantScope({ role: 'tenant_admin', tenantId: null })).toEqual({ kind: 'none' })
    expect(tenantScope({ role: 'tenant_admin', tenantId: '   ' })).toEqual({ kind: 'none' })
    expect(tenantScope({ role: 'user', tenantId: 't1' })).toEqual({ kind: 'none' })
    expect(tenantScope(null)).toEqual({ kind: 'none' })
  })

  it('canAdministerTenant denies by default', () => {
    expect(canAdministerTenant({ role: 'superadmin' }, 'anything')).toBe(true)
    expect(canAdministerTenant({ role: 'tenant_admin', tenantId: 't1' }, 't1')).toBe(true)
    expect(canAdministerTenant({ role: 'tenant_admin', tenantId: 't1' }, 't2')).toBe(false)
    expect(canAdministerTenant({ role: 'tenant_admin', tenantId: 't1' }, undefined)).toBe(false)
    expect(canAdministerTenant({ role: 'tenant_admin' }, undefined)).toBe(false)
    expect(canAdministerTenant({ role: 'user', tenantId: 't1' }, 't1')).toBe(false)
  })

  it('tenantFilter returns null (deny) instead of an empty "all" query', () => {
    expect(tenantFilter({ role: 'superadmin' })).toEqual({})
    expect(tenantFilter({ role: 'tenant_admin', tenantId: 't1' })).toEqual({ tenant_id: 't1' })
    expect(tenantFilter({ role: 'tenant_admin', tenantId: 't1' }, ['tenantId', 'organizationId'])).toEqual({
      $or: [{ tenantId: 't1' }, { organizationId: 't1' }],
    })
    expect(tenantFilter({ role: 'tenant_admin' })).toBeNull()
  })
})

describe('existing accounts and invites', () => {
  const ta = { role: 'tenant_admin', tenantId: 't1' }
  it('tenant admin: own member → link, tenant-less → consent, other org / superadmin → forbidden', () => {
    expect(existingAccountInviteAction(ta, { role: 'user', tenantId: 't1' })).toBe('link')
    expect(existingAccountInviteAction(ta, { role: 'tenant_admin', tenantId: 't1' })).toBe('link')
    expect(existingAccountInviteAction(ta, { role: 'user' })).toBe('needs_consent')
    expect(existingAccountInviteAction(ta, { role: 'user', tenantId: 't2' })).toBe('forbidden')
    expect(existingAccountInviteAction(ta, { role: 'superadmin' })).toBe('forbidden')
    expect(existingAccountInviteAction({ role: 'tenant_admin' }, { role: 'user' })).toBe('forbidden')
  })
  it('superadmin may link anyone', () => {
    expect(existingAccountInviteAction({ role: 'superadmin' }, { role: 'user', tenantId: 't2' })).toBe('link')
  })
})

describe('login back-off (per account + IP)', () => {
  it('first five failures are free, then 30s doubling to a 15 min cap', () => {
    expect(loginBackoffMs(0)).toBe(0)
    expect(loginBackoffMs(4)).toBe(0)
    expect(loginBackoffMs(5)).toBe(30_000)
    expect(loginBackoffMs(6)).toBe(60_000)
    expect(loginBackoffMs(7)).toBe(120_000)
    expect(loginBackoffMs(50)).toBe(15 * 60_000)
    expect(loginBackoffMs(Number.NaN)).toBe(0)
  })
})

describe('misc account rules', () => {
  it('badge variant never exceeds the holder role', () => {
    expect(allowedBadgeVariant('user', 'admin')).toBe('user')
    expect(allowedBadgeVariant('tenant_admin', 'admin')).toBe('tenant')
    expect(allowedBadgeVariant('superadmin', 'admin')).toBe('admin')
    expect(allowedBadgeVariant('superadmin', 'user')).toBe('user')
    expect(allowedBadgeVariant('user', null)).toBe('user')
  })

  it('password minimum is 8', () => {
    expect(passwordProblem('1234567')).toMatch(/8/)
    expect(passwordProblem('12345678')).toBeNull()
    expect(passwordProblem(undefined)).not.toBeNull()
  })

  it('stripUserSecrets removes TOTP, reset hashes and the face template', () => {
    const out = stripUserSecrets({
      email: 'a@b.c', passwordHash: 'x', totp_secret: 's', totp_pending_secret: 'p',
      reset_token_hash: 'r', verification_token_hash: 'v', facial_biometric_template: [1, 2],
    })
    expect(out).toEqual({ email: 'a@b.c', has_enrolled_face: true })
  })
})

// ─── Session token + request user resolution (DB mocked) ───────────────────

const db = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  tenant: null as Record<string, unknown> | null,
  revokedSids: new Set<string>(),
}))
const cookieJar = vi.hoisted(() => ({ value: '' }))

vi.mock('@/lib/mongodb', () => ({
  getMongoDb: vi.fn(async () => ({
    collection: (name: string) => ({
      findOne: vi.fn(async (q: Record<string, unknown>) => {
        if (name === 'user') return db.user
        if (name === 'tenants') return db.tenant
        if (name === 'revoked_sessions') return db.revokedSids.has(String(q.sid)) ? { _id: 1 } : null
        return null
      }),
      updateOne: vi.fn(async () => ({})),
      createIndex: vi.fn(async () => ''),
    }),
  })),
}))
vi.mock('@/lib/server-secrets-cache', () => ({
  readServerSecrets: vi.fn(async () => ({ session_secret: 'test-session-secret-0123456789abcdef0123456789' })),
  isMaskedSecret: () => false,
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (n: string) => (n === 'codespectra_session' && cookieJar.value ? { value: cookieJar.value } : undefined),
    set: vi.fn(),
  })),
  headers: vi.fn(async () => new Headers()),
}))
vi.mock('@/lib/firebase-admin', () => ({ getAdminAuthInstance: vi.fn(async () => null) }))
vi.mock('@/lib/boot-scheduler', () => ({ bootSchedulerOnce: vi.fn() }))

describe('verifySessionToken + getAPIUser', () => {
  beforeEach(async () => {
    const { invalidateAuthProfile, invalidateTenantCache } = await import('@/lib/session')
    invalidateAuthProfile()
    invalidateTenantCache()
    db.user = { _id: 'u1', id: 'u1', email: 'a@x.io', role: 'superadmin', session_version: 1 }
    db.tenant = null
    db.revokedSids.clear()
    cookieJar.value = ''
  })

  async function mint(role = 'superadmin', ver = 1) {
    const { signSessionToken } = await import('@/lib/session')
    return signSessionToken({ uid: 'u1', email: 'a@x.io', role, ver })
  }

  it('accepts a current token', async () => {
    const { verifySessionToken } = await import('@/lib/session')
    expect(await verifySessionToken(await mint())).toMatchObject({ uid: 'u1' })
  })

  it('refuses a token whose account was deleted', async () => {
    const { verifySessionToken, invalidateAuthProfile } = await import('@/lib/session')
    const t = await mint()
    db.user = null
    invalidateAuthProfile('u1')
    expect(await verifySessionToken(t)).toBeNull()
  })

  it('refuses a token after deactivation or a version bump', async () => {
    const { verifySessionToken, invalidateAuthProfile } = await import('@/lib/session')
    const t = await mint()
    db.user = { ...db.user!, status: 'inactive' }
    invalidateAuthProfile('u1')
    expect(await verifySessionToken(t)).toBeNull()
    db.user = { ...db.user!, status: 'active', session_version: 2 }
    invalidateAuthProfile('u1')
    expect(await verifySessionToken(t)).toBeNull()
  })

  it('refuses a signed-out session id', async () => {
    const { verifySessionToken, revokeSessionToken } = await import('@/lib/session')
    const t = await mint()
    await revokeSessionToken(t)
    const { decodeJwt } = await import('jose')
    db.revokedSids.add(String(decodeJwt(t).sid))
    expect(await verifySessionToken(t)).toBeNull()
  })

  it('getAPIUser uses the DB role, not the token role (demotion bites immediately)', async () => {
    const { getAPIUser } = await import('@/lib/route-auth')
    const { invalidateAuthProfile } = await import('@/lib/session')
    cookieJar.value = await mint('superadmin')
    expect((await getAPIUser())?.role).toBe('superadmin')
    db.user = { ...db.user!, role: 'user' }
    invalidateAuthProfile('u1')
    expect((await getAPIUser())?.role).toBe('user')
  })

  it('a tenant-less tenant_admin is not an admin anywhere', async () => {
    const { getAPIUser, requireAdmin } = await import('@/lib/route-auth')
    db.user = { ...db.user!, role: 'tenant_admin', tenantId: null }
    cookieJar.value = await mint('tenant_admin')
    expect((await getAPIUser())?.role).toBe('user')
    expect(await requireAdmin()).toMatchObject({ status: 403 })
  })

  it('a suspended tenant’s admin loses admin access', async () => {
    const { requireAdmin, getAPIUser } = await import('@/lib/route-auth')
    db.user = { ...db.user!, role: 'tenant_admin', tenantId: 't1' }
    db.tenant = { id: 't1', is_active: true }
    cookieJar.value = await mint('tenant_admin')
    expect((await getAPIUser())?.role).toBe('tenant_admin')
    const { invalidateTenantCache, invalidateAuthProfile } = await import('@/lib/session')
    db.tenant = { id: 't1', is_active: false }
    invalidateTenantCache('t1')
    invalidateAuthProfile('u1')
    expect(await requireAdmin()).toMatchObject({ status: 403 })
  })
})
