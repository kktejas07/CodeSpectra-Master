/**
 * Pure account / session / tenant rules shared by every auth path.
 *
 * No DB or Next imports here so the rules can be unit-tested directly
 * (tests/auth-account.test.ts). The I/O lives in lib/session.ts and
 * lib/route-auth.ts, which call into these functions.
 */
import { normalizeUserRole } from './rbac'
import type { UserRole } from './types/rbac-types'

/** Fields of the `user` doc the auth layer reads. Everything optional — old docs vary. */
export interface AuthProfileLike {
  id?: unknown
  _id?: unknown
  email?: unknown
  role?: unknown
  status?: unknown
  isActive?: unknown
  deletedAt?: unknown
  tenantId?: unknown
  organizationId?: unknown
  session_version?: unknown
  sessions_revoked_at?: unknown
}

export type AccountBlock = 'missing' | 'inactive'

/** A deactivated, suspended or soft-deleted account must not authenticate. */
export function accountBlockReason(profile: AuthProfileLike | null | undefined): AccountBlock | null {
  if (!profile) return 'missing'
  const status = typeof profile.status === 'string' ? profile.status.toLowerCase().trim() : ''
  if (status === 'inactive' || status === 'suspended' || status === 'deleted' || status === 'disabled') return 'inactive'
  if (profile.isActive === false) return 'inactive'
  if (profile.deletedAt) return 'inactive'
  return null
}

export function profileTenantId(profile: AuthProfileLike | null | undefined): string | null {
  if (!profile) return null
  const t = profile.tenantId ?? profile.organizationId
  return typeof t === 'string' && t.trim() ? t.trim() : null
}

export type ResolvedAccount =
  | { ok: true; role: UserRole; tenantId: string | null }
  | { ok: false; reason: AccountBlock }

/**
 * The role a request runs with. Always from the DB profile — the role baked
 * into a session token is never trusted (it goes stale on demotion).
 *
 * A tenant_admin is only an admin of a tenant that exists and is active:
 * with no tenant, or a suspended / deleted tenant (`tenantActive === false`),
 * the account runs as a plain `user`, so no route can fall through to an
 * unscoped "all tenants" query.
 */
export function resolveAccount(
  profile: AuthProfileLike | null | undefined,
  opts: { tenantActive?: boolean | null } = {},
): ResolvedAccount {
  const block = accountBlockReason(profile)
  if (block) return { ok: false, reason: block }
  const role = normalizeUserRole(typeof profile!.role === 'string' ? profile!.role : null)
  const tenantId = profileTenantId(profile)
  if (role === 'tenant_admin' && (!tenantId || opts.tenantActive === false)) {
    return { ok: true, role: 'user', tenantId }
  }
  return { ok: true, role, tenantId }
}

/** Session JWT version check. Tokens minted before versioning count as version 1. */
export function isSessionVersionCurrent(tokenVer: unknown, profile: AuthProfileLike | null | undefined): boolean {
  if (!profile) return false
  const current = typeof profile.session_version === 'number' ? profile.session_version : 1
  const ver = typeof tokenVer === 'number' ? tokenVer : 1
  return ver === current
}

/**
 * For credentials that carry no version (Firebase session cookies / ID
 * tokens): reject ones issued before the account's last "sign out everywhere".
 * `issuedAtSec` is the JWT `iat` (seconds).
 */
export function issuedAfterRevocation(issuedAtSec: unknown, profile: AuthProfileLike | null | undefined): boolean {
  if (!profile) return false
  const raw = profile.sessions_revoked_at
  if (!raw) return true
  const revokedMs = raw instanceof Date ? raw.getTime() : new Date(String(raw)).getTime()
  if (Number.isNaN(revokedMs)) return true
  const iat = typeof issuedAtSec === 'number' ? issuedAtSec * 1000 : NaN
  if (Number.isNaN(iat)) return false
  // 1s slack: iat has second precision.
  return iat + 1000 >= revokedMs
}

// ─── Tenant access ──────────────────────────────────────────────────────────

export interface TenantActor {
  role: string
  tenantId?: string | null
}

export type TenantScope =
  | { kind: 'all' }
  | { kind: 'tenant'; tenantId: string }
  | { kind: 'none' }

/**
 * What a caller may see across tenants. Deny by default: only a superadmin
 * sees everything; a tenant_admin sees exactly their tenant; a tenant_admin
 * without a tenant (or any other role) sees no tenant's admin data.
 */
export function tenantScope(actor: TenantActor | null | undefined): TenantScope {
  if (!actor) return { kind: 'none' }
  const role = normalizeUserRole(actor.role)
  if (role === 'superadmin') return { kind: 'all' }
  if (role === 'tenant_admin') {
    const t = typeof actor.tenantId === 'string' ? actor.tenantId.trim() : ''
    return t ? { kind: 'tenant', tenantId: t } : { kind: 'none' }
  }
  return { kind: 'none' }
}

/** May this caller administer a resource owned by `resourceTenantId`? */
export function canAdministerTenant(actor: TenantActor | null | undefined, resourceTenantId: unknown): boolean {
  const scope = tenantScope(actor)
  if (scope.kind === 'all') return true
  if (scope.kind === 'none') return false
  return typeof resourceTenantId === 'string' && resourceTenantId === scope.tenantId
}

/**
 * Mongo filter fragment for a tenant-scoped listing, or `null` when the
 * caller may see nothing (callers must return an empty result / 403 then —
 * never run the query without the filter).
 */
export function tenantFilter(
  actor: TenantActor | null | undefined,
  fields: string[] = ['tenant_id'],
): Record<string, unknown> | null {
  const scope = tenantScope(actor)
  if (scope.kind === 'all') return {}
  if (scope.kind === 'none') return null
  if (fields.length === 1) return { [fields[0]]: scope.tenantId }
  return { $or: fields.map((f) => ({ [f]: scope.tenantId })) }
}

// ─── Invites / provisioning ─────────────────────────────────────────────────

/**
 * What an admin "invite / add member" may do to an account that already
 * exists. Existing accounts are never overwritten (password, id, role,
 * tenant) by an invite.
 *
 * - `link`: the account is already in the caller's tenant (or the caller is
 *   a superadmin) — just reference it.
 * - `needs_consent`: a tenant admin wants a tenant-less account in their
 *   org — send an organisation invitation the user must accept.
 * - `forbidden`: the account belongs to another tenant, or is a superadmin.
 */
export function existingAccountInviteAction(
  actor: TenantActor,
  existing: AuthProfileLike,
): 'link' | 'needs_consent' | 'forbidden' {
  const actorRole = normalizeUserRole(actor.role)
  const existingRole = normalizeUserRole(typeof existing.role === 'string' ? existing.role : null)
  const existingTenant = profileTenantId(existing)
  if (actorRole === 'superadmin') return 'link'
  if (existingRole === 'superadmin') return 'forbidden'
  const scope = tenantScope(actor)
  if (scope.kind !== 'tenant') return 'forbidden'
  if (existingTenant === scope.tenantId) return 'link'
  if (existingTenant) return 'forbidden'
  return 'needs_consent'
}

// ─── Login throttling ───────────────────────────────────────────────────────

/** Free failed attempts per account+IP before back-off starts. */
export const LOGIN_FREE_FAILURES = 5
const BACKOFF_BASE_MS = 30_000
const BACKOFF_MAX_MS = 15 * 60_000

/**
 * Lock-out after `failures` consecutive failures for one account from one
 * IP: none for the first five, then 30s, 60s, 2m … capped at 15 minutes.
 * Keyed on account+IP so one noisy user behind a campus NAT can't lock out
 * everyone else on that IP.
 */
export function loginBackoffMs(failures: number): number {
  if (!Number.isFinite(failures) || failures < LOGIN_FREE_FAILURES) return 0
  const step = failures - LOGIN_FREE_FAILURES
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.min(step, 16))
}

// ─── Sensitive fields ───────────────────────────────────────────────────────

/** Never returned by any API — not to admins, not in the user's own export. */
export const SECRET_USER_FIELDS = [
  'passwordHash',
  'totp_secret',
  'totp_pending_secret',
  'reset_token_hash',
  'reset_token_expires',
  'reset_token_used',
  'verification_token_hash',
  'verification_token_expires',
  'session_version',
  'sessions_revoked_at',
] as const

/** Secrets plus the raw biometric template (only a yes/no is ever shown). */
export const PRIVATE_USER_FIELDS = [...SECRET_USER_FIELDS, 'facial_biometric_template'] as const

export function stripUserSecrets<T extends Record<string, unknown>>(doc: T, fields: readonly string[] = PRIVATE_USER_FIELDS): Record<string, unknown> {
  const out: Record<string, unknown> = { ...doc }
  for (const f of fields) delete out[f]
  if ('facial_biometric_template' in doc && fields.includes('facial_biometric_template')) {
    out.has_enrolled_face = !!doc.facial_biometric_template
  }
  return out
}

/** Mongo projection excluding every private field. */
export function privateFieldsProjection(fields: readonly string[] = PRIVATE_USER_FIELDS): Record<string, 0> {
  return Object.fromEntries(fields.map((f) => [f, 0])) as Record<string, 0>
}

// ─── ID card variant ────────────────────────────────────────────────────────

export type BadgeVariant = 'user' | 'admin' | 'tenant'

export function nativeBadgeVariant(role: string | null | undefined): BadgeVariant {
  const r = normalizeUserRole(role)
  if (r === 'superadmin') return 'admin'
  if (r === 'tenant_admin') return 'tenant'
  return 'user'
}

/**
 * A badge may show the holder's own role, or the plain member badge.
 * Never a higher one (`?variant=admin` used to mint a "Superadmin" badge).
 */
export function allowedBadgeVariant(role: string | null | undefined, requested: string | null | undefined): BadgeVariant {
  return requested === 'user' ? 'user' : nativeBadgeVariant(role)
}

// ─── Passwords ──────────────────────────────────────────────────────────────

export const MIN_PASSWORD_LENGTH = 8

export function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
  }
  if (pw.length > 200) return 'Password is too long'
  return null
}
