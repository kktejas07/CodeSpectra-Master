import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { proctorEvents } from '@/lib/db/ai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  if (gate.user.role !== 'superadmin' && gate.user.role !== 'tenant_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const searchParams = req.nextUrl.searchParams
  const sessionId = searchParams.get('session_id') || ''
  const userId = searchParams.get('user_id') || ''
  const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit')) || 100))

  const col = await proctorEvents()
  const filter: Record<string, unknown> = {}
  if (sessionId) filter.session_id = sessionId
  if (userId) filter.user_id = userId

  const events = await col.find(filter).sort({ created_at: -1 }).limit(limit).toArray()

  // Aggregate violation counts
  const violations = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.event_type] = (acc[e.event_type] || 0) + 1
    return acc
  }, {})

  return NextResponse.json({
    events,
    violations,
    total: events.length,
    flagged_sessions: [...new Set(events.filter((e) =>
      ['tab_blur', 'fullscreen_exit', 'idle_60s', 'multi_face'].includes(e.event_type)
    ).map((e) => e.session_id))],
  })
}
