import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { webVitalsEvents } from '@/lib/db/misc'
import { percentile75 } from '@/lib/web-vitals-stats'

const RANGE_MS: Record<string, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

const METRICS = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB', 'FID'] as const

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const sp = request.nextUrl.searchParams
  const rangeKey = sp.get('range') || '24h'
  const rangeMs = RANGE_MS[rangeKey] ?? RANGE_MS['24h']
  const routeScope = (sp.get('route') || 'all').trim()
  const since = new Date(Date.now() - rangeMs).toISOString()

  try {
    const col = await webVitalsEvents()
    const raw = await col
      .find({ created_at: { $gte: since } })
      .sort({ created_at: -1 })
      .limit(12000)
      .toArray()

    const rows =
      routeScope && routeScope !== 'all'
        ? raw.filter((r) => {
            const rt = (r.route as string) || ''
            return rt === routeScope || rt.startsWith(`${routeScope}/`)
          })
        : raw

    const byMetric: Record<string, number[]> = {}
    for (const m of METRICS) byMetric[m] = []
    for (const row of rows) {
      const name = row.metric_name as string
      const v = row.metric_value as number
      if (name && typeof v === 'number' && Number.isFinite(v) && byMetric[name]) {
        byMetric[name].push(v)
      }
    }

    const p75: Record<string, number | null> = {}
    const counts: Record<string, number> = {}
    for (const m of METRICS) {
      p75[m] = percentile75(byMetric[m])
      counts[m] = byMetric[m].length
    }

    return NextResponse.json({
      range: rangeKey,
      route: routeScope || 'all',
      since,
      sampleSize: rows.length,
      p75,
      countsByMetric: counts,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load vitals'
    console.error('[CodeSpectra] web_vitals summary:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
