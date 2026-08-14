/**
 * POST /api/admin/redis/test — verify Redis connectivity in real time.
 * Supports self-hosted `redis://`/`rediss://` (Docker/Dokploy) and Upstash REST
 * (`https://...upstash.io`). Omitting `url`/`token` tests the saved config.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { redisPing } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const body = await req.json().catch(() => ({})) as {
    url?: string
    token?: string
  }

  const result = await redisPing(
    typeof body.url === 'string' ? body.url.trim() : undefined,
    typeof body.token === 'string' ? body.token.trim() : undefined,
  )

  if (!result.ok) {
    return NextResponse.json({ ok: false, mode: result.mode, error: result.error }, { status: 400 })
  }
  return NextResponse.json({ ok: true, mode: result.mode, latencyMs: result.latencyMs })
}