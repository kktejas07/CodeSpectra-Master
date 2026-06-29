import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { adminAuditLogs } from '@/lib/db/misc'

export async function GET(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { searchParams } = new URL(req.url)
  const severity = searchParams.get('severity')
  const outcome = searchParams.get('outcome')
  const q = searchParams.get('q')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)

  try {
    const col = await adminAuditLogs()
    const filter: Record<string, unknown> = {}

    if (severity && severity !== 'all') filter.severity = severity
    if (outcome && outcome !== 'all') filter.outcome = outcome

    let cursor = col.find(filter).sort({ ts: -1 }).limit(limit)

    if (q) {
      const regex = { $regex: q, $options: 'i' } as unknown
      cursor = col.find({
        $and: [
          filter,
          {
            $or: [
              { action: regex },
              { actor: regex },
              { resource: regex },
              { detail: regex },
            ] as Record<string, unknown>[],
          },
        ],
      }).sort({ ts: -1 }).limit(limit)
    }

    const data = await cursor.toArray()
    const stats = {
      total: data.length,
      critical: data.filter(r => r.severity === 'critical').length,
      warning: data.filter(r => r.severity === 'warning').length,
      denied: data.filter(r => r.outcome === 'denied' || r.outcome === 'failure').length,
    }

    return NextResponse.json({ data, stats })
  } catch (error) {
    console.error('[CodeSpectra] Error fetching audit logs:', error)
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 })
  }
}
