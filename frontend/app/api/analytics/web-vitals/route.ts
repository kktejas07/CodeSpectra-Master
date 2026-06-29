import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/route-auth'
import { webVitalsEvents, newId, nowIso } from '@/lib/db/misc'

const ALLOWED_METRICS = new Set(['CLS', 'FCP', 'FID', 'INP', 'LCP', 'TTFB'])

const eventSchema = z.object({
  route: z.string().max(2048).optional(),
  metricName: z.string().max(64),
  metricValue: z.number().finite(),
  metricRating: z.string().max(32).optional(),
  metricId: z.string().max(128).optional(),
  navigationType: z.string().max(64).optional(),
  clientTs: z.string().max(64).optional(),
})

const bodySchema = z.union([
  eventSchema,
  z.object({ events: z.array(eventSchema).min(1).max(24) }),
])

function normalizeEvent(raw: z.infer<typeof eventSchema>) {
  const name = raw.metricName.trim().toUpperCase()
  if (!ALLOWED_METRICS.has(name)) {
    return { error: `Unsupported metric: ${raw.metricName}` as const }
  }
  let clientTs: string | null = null
  if (raw.clientTs) {
    const d = new Date(raw.clientTs)
    if (!Number.isNaN(d.getTime())) clientTs = d.toISOString()
  }
  return {
    ok: true as const,
    row: {
      route: raw.route?.trim() || null,
      metric_name: name,
      metric_value: raw.metricValue,
      metric_rating: raw.metricRating?.trim() || null,
      metric_id: raw.metricId?.trim() || null,
      navigation_type: raw.navigationType?.trim() || null,
      client_ts: clientTs,
    },
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const gate = await requireAuth()
    if ('error' in gate) {
      return NextResponse.json({ ok: true, inserted: 0 })
    }

    let parsed: z.infer<typeof bodySchema>
    try {
      const json: unknown = await request.json()
      parsed = bodySchema.parse(json)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON or schema' }, { status: 400 })
    }

    const items = 'events' in parsed ? parsed.events : [parsed]
    const now = nowIso()
    const docs: Array<Record<string, unknown>> = []
    for (const item of items) {
      const n = normalizeEvent(item)
      if ('error' in n) {
        console.warn('[CodeSpectra] Skipping unsupported metric:', n.error)
        continue
      }
      docs.push({
        id: newId(),
        user_id: gate.user.id,
        ...n.row,
        created_at: now,
      })
    }

    if (docs.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0 })
    }

    try {
      const col = await webVitalsEvents()
      await col.insertMany(docs as unknown as Parameters<typeof col.insertMany>[0])
      return NextResponse.json({ ok: true, inserted: docs.length })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to store vitals'
      console.error('[CodeSpectra] web_vitals_events insert:', msg)
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    console.error('[CodeSpectra] web_vitals unhandled:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
