/** Route helpers for /api/study-plan/** — auth gate, write rate limit, error mapping (no PII in logs). */
import 'server-only'
import { NextResponse } from 'next/server'
import { requireAuth, requireSuperAdmin, type APIUser } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { sanitizeMongoInput } from '@/lib/mongo-sanitize'
import { StudyPlanError } from './service'
import { apiErrorBody } from '@/lib/api-errors'

export const NO_STORE = { 'Cache-Control': 'private, no-store' }
export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

export function errorResponse(e: unknown, where: string) {
  if (e instanceof StudyPlanError) return json(apiErrorBody(e.message), e.status)
  console.error(`[study-plan] ${where} failed:`, (e as Error)?.message)
  return json({ error: 'Something went wrong. Please try again.' }, 500)
}

export async function bodyOf(req: Request): Promise<Record<string, unknown>> {
  const b = await req.json().catch(() => null)
  return b && typeof b === 'object' && !Array.isArray(b) ? sanitizeMongoInput(b as Record<string, unknown>) : {}
}

export async function gate(req: Request, opts: { write?: boolean; bucket?: string; max?: number; windowMs?: number; admin?: boolean } = {}): Promise<{ user: APIUser } | { res: NextResponse }> {
  const a = opts.admin ? await requireSuperAdmin() : await requireAuth()
  if ('error' in a) return { res: json({ error: a.error }, a.status) }
  if (opts.write) {
    const limited = await limitRequest(req, opts.bucket || 'study-plan', a.user.id, opts.max ?? 60, opts.windowMs ?? 60_000)
    if (limited) return { res: limited }
  }
  return { user: a.user }
}
