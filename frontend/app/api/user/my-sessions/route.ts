import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET — interview / mock sessions for the current user. */
export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  try {
    const db = await getMongoDb()
    // Standalone interviews live in `interviews` (lib/db/interviews.ts) — AUTO-030.
    const sessions = await db
      .collection('interviews')
      .find({
        $or: [{ candidate_id: user.id }, { interviewer_id: user.id }],
      }, { projection: { resume_info: 0, questions: 0, feedback: 0, notes: 0 } })
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
    console.error('[user/my-sessions]', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}
