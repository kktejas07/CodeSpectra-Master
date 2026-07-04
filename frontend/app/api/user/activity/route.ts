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

    const [scans, reviews, fixes, submissions, dailyChallenges] = await Promise.all([
      fetchCollection('scan_comments', 'scan', 'Completed code scan'),
      fetchCollection('code_review_comments', 'review', 'Submitted code review'),
      fetchCollection('suggested_fixes', 'fix', 'Applied fix', 'created_at', 'description'),
      fetchCollection('submissions', 'challenge', 'Solved challenge', 'submittedAt', 'problemId'),
      db.collection('daily_challenges').find({ user_id: userId }).sort({ completedAt: -1 }).limit(limit).toArray(),
    ])

    for (const s of scans) events.push(s)
    for (const r of reviews) events.push(r)
    for (const f of fixes) events.push(f)
    for (const sub of submissions) {
      events.push({
        ts: sub.submittedAt as string,
        type: 'challenge',
        title: 'Solved challenge',
        meta: `Challenge · ${timeAgo(sub.submittedAt as string)}`,
        detail: (sub.problemId as string) || 'Problem',
        icon: 'challenge',
      })
    }
    for (const dc of dailyChallenges) {
      if (dc.completedAt) {
        events.push({
          ts: dc.completedAt as string,
          type: 'daily',
          title: 'Daily challenge completed',
          meta: `Daily · ${timeAgo(dc.completedAt as string)}`,
          detail: (dc.problemId as string) || 'Daily challenge',
          icon: 'daily',
        })
      }
    }

    events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())

    return NextResponse.json({ data: events.slice(0, limit) })
  } catch (error) {
    console.error('[CodeSpectra] Error fetching user activity:', error)
    return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 })
  }
}