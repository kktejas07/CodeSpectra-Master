/**
 * Small helpers shared by the /api/contests* route handlers.
 */
import 'server-only'
import { NextResponse } from 'next/server'
import { getAPIUser, type APIUser } from '@/lib/route-auth'
import { errorBody, type ServiceResult } from '@/lib/services/result'
import { logger } from '@/lib/logger'
import { findContest, isContestJudge, isContestStaff } from './service'
import type { ContestDoc } from './types'

export function respond<T>(r: ServiceResult<T>): NextResponse {
  if (!r.ok) return NextResponse.json(errorBody(r), { status: r.status })
  return NextResponse.json(r.data, { status: r.status })
}

export const unauthorized = () => NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 })
export const notFound = () => NextResponse.json({ error: 'Contest not found' }, { status: 404 })

/**
 * The contest if this viewer may see it: drafts only for staff and judges;
 * unlisted contests are visible to anyone with the link.
 */
export async function loadVisible(id: string, user: APIUser | null): Promise<ContestDoc | null> {
  const c = await findContest(id)
  if (!c) return null
  if (c.status === 'draft' && !isContestStaff(user, c) && !isContestJudge(user, c)) return null
  return c
}

export async function withUser(): Promise<APIUser | null> {
  try { return await getAPIUser() } catch { return null }
}

export async function guarded(name: string, fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn()
  } catch (e) {
    logger.error(`[contests] ${name} failed`, (e as Error).message)
    return NextResponse.json({ error: 'Something went wrong. Try again in a moment.' }, { status: 500 })
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const b = await req.json().catch(() => null)
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {}
}
