/**
 * GET /api/events-feed/admin/subscribers[?format=csv&topic=events] — superadmin.
 * JSON: counts + latest 200 (masked). CSV: full export (audited).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { auditAdmin } from '@/lib/admin-audit'
import { listSubscribers, publicView, subscriberStats, subscribersCsv } from '@/lib/subscriptions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const p = new URL(req.url).searchParams
  const topic = p.get('topic') === 'blog' ? 'blog' : p.get('topic') === 'events' ? 'events' : undefined
  if (p.get('format') === 'csv') {
    const rows = await listSubscribers({ topic, limit: 100_000 })
    await auditAdmin(auth.user, 'subscriptions.export', 'subscriptions', topic || 'all', `${rows.length} rows`, 'warning')
    return new NextResponse(subscribersCsv(rows), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="subscribers-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' },
    })
  }
  const [stats, rows] = await Promise.all([subscriberStats(), listSubscribers({ topic, limit: 200 })])
  return NextResponse.json({ stats, subscribers: rows.map((s) => ({ ...publicView(s), created_at: s.created_at, source: s.source })) })
}
