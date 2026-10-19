/**
 * POST /api/analytics/collect — batched first-party analytics (page views,
 * custom events, Web Vitals). Public, CSRF-exempt (sendBeacon can't set
 * headers; nothing here acts for the user), rate limited per client, bots
 * dropped, payload validated (lib/analytics/schema.ts). The user id comes from
 * the session cookie and is stored only with analytics consent ('full' mode).
 * No raw IP is stored.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const limited = await limitRequest(req, 'analytics-collect', null, 120, 60_000)
  if (limited) return limited
  try {
    const user = await getAPIUser().catch(() => null)
    const { ingestRequest } = await import('@/lib/analytics/ingest')
    const out = await ingestRequest(req, { userId: user?.id ?? null, tenantId: user?.tenantId ?? null })
    return NextResponse.json(out.body, { status: out.status, headers: NO_STORE })
  } catch (e) {
    console.error('[analytics] collect failed:', (e as Error)?.message)
    // Analytics must never surface errors to visitors.
    return NextResponse.json({ ok: false }, { status: 202, headers: NO_STORE })
  }
}
