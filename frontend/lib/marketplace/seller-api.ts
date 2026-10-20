/**
 * Route helpers for /api/marketplace/{seller,admin}/**: JSON + error mapping,
 * seller gate (own seller record; superadmins act for the platform store with
 * `?as=platform`), superadmin gate, write rate limit.
 */
import 'server-only'
import { NextResponse } from 'next/server'
import { FileRejected } from '@/lib/ats/files'
import { requireAuth, requireSuperAdmin, type APIUser } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import type { SellerDoc } from './db'
import { MktError } from './settings'
import { sanitizeMongoInput } from '@/lib/mongo-sanitize'

export const NO_STORE = { 'Cache-Control': 'private, no-store' }

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

export function errorResponse(e: unknown, label: string) {
  if (e instanceof MktError || e instanceof FileRejected) return json({ error: e.message }, e.status)
  console.error(`[marketplace] ${label}:`, (e as Error)?.message)
  return json({ error: 'Something went wrong. Try again.' }, 500)
}

export async function bodyOf(req: Request): Promise<Record<string, unknown>> {
  const b = await req.json().catch(() => null)
  // $-operator / __proto__ keys stripped (lib/mongo-sanitize) — bodies feed Mongo filters.
  return b && typeof b === 'object' && !Array.isArray(b) ? sanitizeMongoInput(b as Record<string, unknown>) : {}
}

export function idOk(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id)
}

type SellerGate = { user: APIUser; seller: SellerDoc } | { res: NextResponse }

/** The caller's seller record. `approved` → must be an approved seller. */
export async function sellerGate(req: Request, opts: { approved?: boolean; write?: boolean } = {}): Promise<SellerGate> {
  const a = await requireAuth()
  if ('error' in a) return { res: json({ error: a.error }, a.status) }
  if (opts.write) {
    const limited = await limitRequest(req, 'mkt-seller', a.user.id, 60, 60_000)
    if (limited) return { res: limited }
  }
  const { ensurePlatformSeller, getSellerByUser } = await import('./sellers')
  const asPlatform = new URL(req.url).searchParams.get('as') === 'platform'
  if (asPlatform && a.user.role !== 'superadmin') return { res: json({ error: 'Forbidden' }, 403) }
  const seller = asPlatform ? await ensurePlatformSeller() : await getSellerByUser(a.user.id)
  if (!seller) return { res: json({ error: "You haven't applied to sell yet." }, 404) }
  if (opts.approved && seller.status !== 'approved') return { res: json({ error: 'Your seller account must be approved first.' }, 403) }
  return { user: a.user, seller }
}

export async function adminGate(req: Request, opts: { write?: boolean } = {}): Promise<{ user: APIUser } | { res: NextResponse }> {
  const a = await requireSuperAdmin()
  if ('error' in a) return { res: json({ error: a.error }, a.status) }
  if (opts.write) {
    const limited = await limitRequest(req, 'mkt-admin', a.user.id, 120, 60_000)
    if (limited) return { res: limited }
  }
  return { user: a.user }
}

export function origin(req: Request): string {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
}
