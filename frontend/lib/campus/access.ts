/**
 * Who is on a college's placement team (server only).
 *
 *   superadmin            any college (picks it with ?college=<tenant id>)
 *   college admin         tenant_admin of the college's organisation
 *   placement officer     an account listed in college.staff (added by the college admin)
 *
 * Everything is resolved from the server session; a college id from the
 * request is only honoured for superadmin.
 */
import 'server-only'
import { NextResponse } from 'next/server'
import { getAPIUser, type APIUser } from '@/lib/route-auth'
import { logger } from '@/lib/logger'
import { collegesCol, clean } from './store'
import type { CollegeDoc } from './types'
import { apiErrorBody } from '@/lib/api-errors'

export type CampusRole = 'superadmin' | 'college_admin' | 'placement_officer'
export interface StaffContext { user: APIUser; college: CollegeDoc; role: CampusRole }

/** Pure: the caller's role on a loaded college (null = not staff). */
export function campusRoleFor(user: Pick<APIUser, 'id' | 'role' | 'tenantId'>, college: Pick<CollegeDoc, 'tenant_id' | 'staff'>): CampusRole | null {
  if (user.role === 'superadmin') return 'superadmin'
  if (user.role === 'tenant_admin' && user.tenantId && user.tenantId === college.tenant_id) return 'college_admin'
  if (college.staff.some((s) => s.user_id === user.id)) return 'placement_officer'
  return null
}

/** The college this staff member works for (superadmin: the one asked for). */
export async function loadStaffContext(user: APIUser, requested?: string | null): Promise<StaffContext | null> {
  const col = await collegesCol()
  let college: CollegeDoc | null = null
  if (user.role === 'superadmin') {
    if (!requested) return null
    college = await col.findOne({ tenant_id: requested }, { projection: { _id: 0 } })
  } else if (user.role === 'tenant_admin' && user.tenantId) {
    college = await col.findOne({ tenant_id: user.tenantId }, { projection: { _id: 0 } })
  }
  if (!college) college = await col.findOne({ 'staff.user_id': user.id }, { projection: { _id: 0 } })
  if (!college) return null
  const role = campusRoleFor(user, college)
  return role ? { user, college: clean(college)!, role } : null
}

export const unauthorized = () => NextResponse.json({ error: 'Sign in to continue.', code: 'sign_in_to_continue' }, { status: 401 })
export const noCollege = () => NextResponse.json({ error: 'You are not on a college placement team.', code: 'campus_not_staff' }, { status: 403 })
export const bad = (error: string, status = 400) => NextResponse.json(apiErrorBody(error), { status })

export async function withUser(): Promise<APIUser | null> {
  try { return await getAPIUser() } catch { return null }
}

export async function guarded(name: string, fn: () => Promise<NextResponse | Response>): Promise<NextResponse | Response> {
  try {
    return await fn()
  } catch (e) {
    const status = (e as { status?: number })?.status
    if (typeof status === 'number' && status >= 400 && status < 500) return bad((e as Error).message, status)
    logger.error(`[campus] ${name} failed`, (e as Error).message)
    return NextResponse.json({ error: 'Something went wrong. Try again in a moment.', code: 'server_error_moment' }, { status: 500 })
  }
}

export async function readJson(req: Request, maxBytes = 2_500_000): Promise<Record<string, unknown>> {
  const len = Number(req.headers.get('content-length') || 0)
  if (len > maxBytes) throw new CampusError('That upload is too large', 413)
  const b = await req.json().catch(() => null)
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {}
}

/** Staff route wrapper: signed in + on the college's placement team. */
export async function withStaff(req: Request, fn: (ctx: StaffContext) => Promise<NextResponse | Response>, opts: { adminOnly?: boolean } = {}): Promise<NextResponse | Response> {
  const user = await withUser()
  if (!user) return unauthorized()
  const requested = new URL(req.url).searchParams.get('college')
  const ctx = await loadStaffContext(user, requested)
  if (!ctx) return noCollege()
  if (opts.adminOnly && ctx.role === 'placement_officer') return bad('Only the college admin can change this.', 403)
  return fn(ctx)
}

export class CampusError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}
