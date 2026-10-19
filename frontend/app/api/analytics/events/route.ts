/**
 * POST /api/analytics/events — legacy ingest (old browser bundles). Converted
 *   to the /api/analytics/collect format in anonymous mode and run through the
 *   same validation, bot filter and privacy rules.
 * GET  /api/analytics/events — query raw events (superadmin).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser, requireSuperAdmin } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { analyticsEvents } from '@/lib/db/analytics'
import { sanitizeRegex } from '@/lib/sanitize'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const limited = await limitRequest(req, 'analytics-collect', null, 120, 60_000)
  if (limited) return limited
  try {
    const body = (await req.json().catch(() => null)) as { events?: Array<Record<string, unknown>> } | null
    const legacy = Array.isArray(body?.events) ? body!.events.slice(0, 30) : []
    const events = legacy
      .map((e) => {
        const path = typeof e.path === 'string' && e.path ? e.path : '/'
        const name = String(e.event || '')
        return name === 'page_view'
          ? { t: 'pv', path, ...(typeof e.referrer === 'string' && e.referrer ? { ref: e.referrer } : {}) }
          : /^[a-z][a-z0-9_.:-]{0,63}$/.test(name) ? { t: 'ev', name, path } : null
      })
      .filter(Boolean)
    if (!events.length) return NextResponse.json({ ok: true, inserted: 0 })
    const headers = new Headers(req.headers)
    headers.delete('content-length')
    const forward = new Request(req.url, { method: 'POST', headers, body: JSON.stringify({ v: 1, mode: 'anon', events }) })
    const user = await getAPIUser().catch(() => null)
    const { ingestRequest } = await import('@/lib/analytics/ingest')
    const out = await ingestRequest(forward, { userId: user?.id ?? null, tenantId: user?.tenantId ?? null })
    return NextResponse.json({ ok: out.status === 200, inserted: Number(out.body.accepted) || 0 }, { status: out.status === 200 ? 200 : out.status })
  } catch (e) {
    console.error('[analytics] legacy events insert error:', (e as Error)?.message)
    return NextResponse.json({ ok: true, inserted: 0 })
  }
}

// ─── GET: query events (superadmin) ─────────────────────────────────────────

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '100') || 100, 1000)
  const event = searchParams.get('event')
  const path = searchParams.get('path')
  const userId = searchParams.get('user_id')
  const since = searchParams.get('since') // ISO date string

  const filter: Record<string, unknown> = {}
  if (event) filter.event = event
  if (path) filter.path = { $regex: sanitizeRegex(path), $options: 'i' }
  if (userId) filter.user_id = userId
  if (since) filter.timestamp = { $gte: since }

  const col = await analyticsEvents()
  const events = await col.find(filter, { projection: { _id: 0, visitor_hash: 0, dedupe_key: 0 } }).sort({ timestamp: -1 }).limit(limit).toArray()
  const total = await col.countDocuments(filter)

  return NextResponse.json({ events, total, limit })
}
