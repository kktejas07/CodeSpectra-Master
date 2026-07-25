import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

interface ActivityEvent {
  ts: string
  type: string
  title: string
  meta: string
  detail: string
  icon?: string
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

export async function GET(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
  const userId = gate.user.id
  const isAdmin = gate.user.role === 'superadmin' || gate.user.role === 'tenant_admin'

  try {
    const db = await getMongoDb()
    const events: ActivityEvent[] = []

    const fetchCollection = async (
      collection: string,
      type: string,
      title: string,
      dateField = 'created_at',
      detailField = 'file_path'
    ) => {
      const items = await db.collection(collection)
        .find({ user_id: userId, [dateField]: { $exists: true } })
        .sort({ [dateField]: -1 })
        .limit(limit)
        .toArray()

      return items.map((s) => ({
        ts: s[dateField] as string,
        type,
        title,
        meta: `${type.charAt(0).toUpperCase() + type.slice(1)} · ${timeAgo(s[dateField] as string)}`,
        detail: (s[detailField] as string) || collection,
        icon: type,
      }))
    }

    const [
      scans,
      reviews,
      fixes,
      submissions,
      dailyChallenges,
    ] = await Promise.all([
      fetchCollection('scan_comments', 'scan', 'Completed code scan'),
      fetchCollection('code_review_comments', 'review', 'Submitted code review'),
      fetchCollection('suggested_fixes', 'fix', 'Applied fix', 'created_at', 'description'),
      fetchCollection('submissions', 'challenge', 'Solved challenge', 'submittedAt', 'problemId'),
      fetchCollection('daily_challenges', 'daily', 'Daily challenge completed', 'completedAt', 'problemId'),
    ])

    const [hackathonEvents, proctorEvents] = await Promise.all([
      db.collection('hackathon_activity').find({ user_id: userId, created_at: { $exists: true } }).sort({ created_at: -1 }).limit(limit).toArray(),
      db.collection('hackathon_proctor_events').find({ user_id: userId, created_at: { $exists: true } }).sort({ created_at: -1 }).limit(limit).toArray(),
    ])

    for (const s of scans) events.push(s)
    for (const r of reviews) events.push(r)
    for (const f of fixes) events.push(f)
    for (const sub of submissions) {
      events.push({
        ts: (sub as any).submittedAt as string,
        type: 'challenge',
        title: 'Solved challenge',
        meta: `Challenge · ${timeAgo((sub as any).submittedAt as string)}`,
        detail: ((sub as any).problemId as string) || 'Problem',
        icon: 'challenge',
      })
    }
    for (const dc of dailyChallenges) {
      if (dc.ts) {
        events.push({
          ts: dc.ts,
          type: 'daily',
          title: 'Daily challenge completed',
          meta: `Daily · ${timeAgo(dc.ts)}`,
          detail: dc.detail || 'Daily challenge',
          icon: 'daily',
        })
      }
    }
    for (const he of hackathonEvents as any[]) {
      if (he.created_at) {
        events.push({
          ts: he.created_at as string,
          type: 'challenge',
          title: he.action || ' Participated',
          meta: `Hackathon · ${timeAgo(he.created_at as string)}`,
          detail: he.detail || he.problem_slug || 'Event',
          icon: 'challenge',
        })
      }
    }
    for (const pe of proctorEvents as any[]) {
      if (pe.created_at) {
        events.push({
          ts: pe.created_at as string,
          type: 'challenge',
          title: pe.event_type || 'Proctor event',
          meta: `Proctor · ${timeAgo(pe.created_at as string)}`,
          detail: pe.meta || pe.session_kind || 'Event',
          icon: 'challenge',
        })
      }
    }

    if (isAdmin) {
      const auditEvents = await db.collection('audit_logs')
        .find({ actor: userId, ts: { $exists: true } })
        .sort({ ts: -1 })
        .limit(limit)
        .toArray()
      for (const ae of auditEvents) {
        if ((ae as any).ts) {
          events.push({
            ts: (ae as any).ts as string,
            type: 'challenge',
            title: (ae as any).action || 'Admin action',
            meta: `Admin · ${timeAgo((ae as any).ts as string)}`,
            detail: ((ae as any).resource as string) || 'System',
            icon: 'challenge',
          })
        }
      }
    }

    events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())

    return NextResponse.json({ data: events.slice(0, limit) })
  } catch (error) {
    console.error('[CodeSpectra] Error fetching user activity:', error)
    return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 })
  }
}