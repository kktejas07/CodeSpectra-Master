/**
 * Route helpers for /api/live-drives/** (server only): sign-in gate, JSON body
 * with a size cap, and one error mapping (LiveDriveError → status + code).
 */
import 'server-only'
import { NextResponse } from 'next/server'
import { getAPIUser, type APIUser } from '@/lib/route-auth'
import { apiErrorBody } from '@/lib/api-errors'
import { logger } from '@/lib/logger'
import { LiveDriveError } from './service'

export const NO_STORE = { 'Cache-Control': 'private, no-store' }
export const ID_RE = /^[A-Za-z0-9_-]{1,128}$/

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

export async function body(req: Request, maxBytes = 512_000): Promise<unknown> {
  const len = Number(req.headers.get('content-length') || 0)
  if (len > maxBytes) throw new LiveDriveError('Request too large', 413, 'ld_too_large')
  return req.json().catch(() => null)
}

/** Signed in → run; LiveDriveError → its status; anything else → 500 (logged, no PII). */
export async function handle(name: string, fn: (user: APIUser) => Promise<Response>): Promise<Response> {
  const user = await getAPIUser()
  if (!user) return json({ error: 'Unauthorized', code: 'unauthorized' }, 401)
  try {
    return await fn(user)
  } catch (e) {
    if (e instanceof LiveDriveError) return json(apiErrorBody(e.message, e.code, e.params), e.status)
    logger.error(`[live-drives] ${name} failed`, (e as Error)?.message)
    return json({ error: 'Something went wrong. Try again in a moment.', code: 'server_error_moment' }, 500)
  }
}

export function badId() {
  return json({ error: 'Live drive not found', code: 'ld_not_found' }, 404)
}
