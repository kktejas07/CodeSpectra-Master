import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function GET(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
  const userId = gate.user.id

  try {
    const db = await getMongoDb()
    const events: Array<{ ts: string; type: string; title: string; meta: string; detail: string }> = []

    const scans = await db.collection('scan_comments')
      .find({ user_id: userId })
      .sort({ created_at: -1 })
      .limit(limit)
      .toArray()

    for (const s of scans) {
      events.push({
        ts: s.created_at,
        type: 'scan',
        title: 'Completed code scan',
        meta: `Scan · ${timeAgo(s.created_at)}`,
        detail: s.file_path || 'Repository scan',
      })
    }

    const reviews = await db.collection('code_review_comments')
      .find({ user_id: userId })
      .sort({ created_at: -1 })
      .limit(limit)
      .toArray()

    for (const r of reviews) {
      events.push({
        ts: r.created_at,
        type: 'review',
        title: 'Submitted code review',
        meta: `Review · ${timeAgo(r.created_at)}`,
        detail: r.file_path || 'Code review',
      })
    }

    const fixes = await db.collection('suggested_fixes')
      .find({ user_id: userId })
      .sort({ created_at: -1 })
      .limit(limit)
      .toArray()

    for (const f of fixes) {
      events.push({
        ts: f.created_at,
        type: 'fix',
        title: `Fix ${f.status === 'applied' ? 'applied' : 'suggested'}`,
        meta: `Fix · ${timeAgo(f.created_at)}`,
        detail: f.description || 'Code fix',
      })
    }

    events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())

    return NextResponse.json({ data: events.slice(0, limit) })
  } catch (error) {
    console.error('[CodeSpectra] Error fetching user activity:', error)
    return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 })
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return iso.slice(0, 10)
}
