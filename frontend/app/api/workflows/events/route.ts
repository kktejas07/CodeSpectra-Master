/**
 * GET /api/workflows/events?type=exam.submitted — the last few real events of
 * a type (your organisation's only), to use as a test-run payload.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireWorkflowAdmin } from '@/lib/automation/access'
import { recentEvents } from '@/lib/automation/events'
import { isKnownEventType } from '@/lib/automation/event-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await requireWorkflowAdmin()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const type = req.nextUrl.searchParams.get('type') || ''
  if (!isKnownEventType(type)) return NextResponse.json({ error: 'unknown event type' }, { status: 400 })
  if (!g.platform && !g.tenantId) return NextResponse.json({ items: [] })
  const rows = await recentEvents({ type, tenantId: g.platform ? null : g.tenantId, limit: 5 })
  return NextResponse.json({ items: rows.map((r) => ({ id: r.id, created_at: r.created_at, status: r.status, payload: r.payload })) })
}
