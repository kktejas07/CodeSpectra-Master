import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET — interview / mock sessions for the current user. */
export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const db = await getMongoDb()
    const sessions = await db
      .collection('interview_sessions')
      .find({
        $or: [{ candidate_id: user.id }, { userId: user.id }, { created_by: user.id }],
      })
      .sort({ scheduled_at: -1 })
      .limit(50)
      .toArray()

    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: String(s.id || s._id),
        title: s.title || 'Interview session',
        type: s.type || 'interview',
        role: s.role || '',
        status: s.status || 'scheduled',
        scheduledAt: s.scheduled_at || s.created_at || null,
        href: `/dashboard/interviews/${s.id || s._id}`,
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
