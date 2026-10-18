/**
 * Shared result shape for lib/services/*: business logic extracted from API
 * routes so the routes and the admin agent's tools run the SAME code
 * (permissions, plan limits, emails, audit logs, notifications).
 *
 * A service never builds an HTTP response. Routes map `status` + `body` to
 * NextResponse.json(body, { status }) — `body` is exactly what the route used
 * to return, so behaviour stays identical.
 */
import type { APIUser } from '@/lib/route-auth'

export type ServiceOk<T> = { ok: true; status: number; data: T }
export type ServiceErr = {
  ok: false
  status: number
  error: string
  /** Full JSON body the route returns (defaults to { error }). */
  body?: Record<string, unknown>
}
export type ServiceResult<T> = ServiceOk<T> | ServiceErr

export const ok = <T>(data: T, status = 200): ServiceOk<T> => ({ ok: true, status, data })

export const fail = (status: number, error: string, body?: Record<string, unknown>): ServiceErr => ({
  ok: false,
  status,
  error,
  ...(body ? { body } : {}),
})

/** JSON body a route returns for a failed service call. */
export function errorBody(r: ServiceErr): Record<string, unknown> {
  return r.body ?? { error: r.error }
}

/** The acting user, as the services see it (route session or agent caller). */
export type ServiceUser = Pick<APIUser, 'id' | 'email' | 'role' | 'tenantId'> & { name?: string }
