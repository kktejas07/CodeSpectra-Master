/** Route helpers for /api/mentors/** (signed-in; writes rate limited). Reuses the marketplace JSON / error mapping. */
import 'server-only'
import type { NextResponse } from 'next/server'
import { requireAuth, type APIUser } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { json } from '@/lib/marketplace/seller-api'

export { json, errorResponse, bodyOf, idOk, adminGate } from '@/lib/marketplace/seller-api'

export async function userGate(req: Request, opts: { write?: boolean; bucket?: string; max?: number } = {}): Promise<{ user: APIUser } | { res: NextResponse }> {
  const a = await requireAuth()
  if ('error' in a) return { res: json({ error: a.error }, a.status) }
  if (opts.write) {
    const limited = await limitRequest(req, opts.bucket || 'mentors', a.user.id, opts.max ?? 30, 60_000)
    if (limited) return { res: limited }
  }
  return { user: a.user }
}
