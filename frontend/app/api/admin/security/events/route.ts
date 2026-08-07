import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

// GET /api/admin/security/events?severity=critical&limit=50
export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const { searchParams } = new URL(req.url)
    const severity = searchParams.get('severity')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const db = await getMongoDb()

    const filter: Record<string, unknown> = {}
    if (severity && severity !== 'all') filter.severity = severity

    const [data, stats] = await Promise.all([
      db.collection('security_events')
        .find(filter)
        .sort({ ts: -1 })
        .limit(limit)
        .toArray(),
      db.collection('security_events').aggregate<{ severity: string; count: number }>([
        { $group: { _id: '$severity', count: { $sum: 1 } } },
      ]).toArray(),
    ])

    const bySeverity = stats.reduce<Record<string, number>>((acc, s) => {
      acc[s.severity] = s.count
      return acc
    }, {})
    const total = await db.collection('security_events').countDocuments({})

    return NextResponse.json({
      data,
      stats: {
        total,
        info: bySeverity.info || 0,
        warning: bySeverity.warning || 0,
        critical: bySeverity.critical || 0,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
