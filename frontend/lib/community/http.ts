/**
 * Route helpers shared by the cohort, community and integration APIs
 * (/api/cohorts/**, /api/community/**, /api/integrations/tenant/**, /api/lti/**):
 * a domain error with a stable `code` (+ `params`) that the client localizes
 * from the `community` catalog, JSON responses that are never cached, body
 * parsing with $-operator stripping, id validation and gates.
 */
import 'server-only'
import { NextResponse } from 'next/server'
import { requireAdmin, requireAuth, requireSuperAdmin, type APIUser } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { sanitizeMongoInput } from '@/lib/mongo-sanitize'
import { apiErrorBody } from '@/lib/api-errors'

/** Domain error: `code` is a key of the `community` catalog's `err_` entries (client side). */
export class FeatureError extends Error {
  constructor(message: string, public status = 400, public code = 'invalid_request', public params?: Record<string, string | number>) {
    super(message)
    this.name = 'FeatureError'
  }
}

export const fail = (message: string, status = 400, code = 'invalid_request', params?: Record<string, string | number>) =>
  new FeatureError(message, status, code, params)

export const NO_STORE = { 'Cache-Control': 'private, no-store' }

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

export function errorResponse(e: unknown, label: string) {
  if (e instanceof FeatureError) return json(apiErrorBody(e.message, e.code, e.params), e.status)
  console.error(`[${label}]`, (e as Error)?.message)
  return json(apiErrorBody('Something went wrong. Try again.', 'server_error_retry'), 500)
}

export async function bodyOf(req: Request): Promise<Record<string, unknown>> {
  const b = await req.json().catch(() => null)
  return b && typeof b === 'object' && !Array.isArray(b) ? sanitizeMongoInput(b as Record<string, unknown>) : {}
}

export function idOk(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id)
}

/** Signed-in caller; writes are rate limited per user (bucket + max per minute). */
export async function userGate(req: Request, opts: { write?: boolean; bucket?: string; max?: number; windowMs?: number } = {}): Promise<{ user: APIUser } | { res: NextResponse }> {
  const a = await requireAuth()
  if ('error' in a) return { res: json(apiErrorBody(a.error || 'Unauthorized'), a.status) }
  if (opts.write) {
    const limited = await limitRequest(req, opts.bucket || 'community', a.user.id, opts.max ?? 30, opts.windowMs ?? 60_000)
    if (limited) return { res: limited }
  }
  return { user: a.user }
}

/** Organisation admin (tenant_admin with an org) or superadmin, admin 2FA enforced; writes rate limited. */
export async function adminGate(req: Request, opts: { write?: boolean; superOnly?: boolean } = {}): Promise<{ user: APIUser } | { res: NextResponse }> {
  const a = opts.superOnly ? await requireSuperAdmin() : await requireAdmin()
  if ('error' in a) {
    const code = (a as { code?: string }).code
    return { res: json(apiErrorBody(a.error || 'Forbidden', code), a.status) }
  }
  if (opts.write) {
    const limited = await limitRequest(req, 'community-admin', a.user.id, 60, 60_000)
    if (limited) return { res: limited }
  }
  return { user: a.user }
}

/** The organisation a tenant admin manages; superadmins act for the platform (`platform`). */
export function tenantOf(user: Pick<APIUser, 'role' | 'tenantId'>): string | null {
  if (user.role === 'superadmin') return user.tenantId || 'platform'
  if (user.role === 'tenant_admin' && user.tenantId) return user.tenantId
  return null
}

export function isStaffRole(user: Pick<APIUser, 'role'>): boolean {
  return user.role === 'superadmin' || user.role === 'tenant_admin'
}

/** Error body with a feature code (localized client side from the `community` catalog's err_<code>). */
export function errJson(status: number, message: string, code: string, params?: Record<string, string | number>) {
  return json(apiErrorBody(message, code, params), status)
}
