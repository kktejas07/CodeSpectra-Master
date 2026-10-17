import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { users as usersCol } from '@/lib/db/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { id: examId } = await ctx.params

  try {
    const db = await getMongoDb()

    // Tenant admins may read reports for their own tenant's exams only.
    const owned = await requireTenantEntity(db, 'exams', examId, gate.user)
    if ('error' in owned) return NextResponse.json({ error: owned.error }, { status: owned.status })
    const exam = owned.doc

    // All submissions for this exam
    const submissions = await db.collection('exam_submissions')
      .find({ exam_id: examId })
      .sort({ created_at: -1 })
      .toArray()

    // All proctor events for this exam's submissions
    const userIds = [...new Set(submissions.map((s: any) => s.user_id).filter(Boolean))]
    const sessionIds = [...new Set(submissions.map((s: any) => s.id).filter(Boolean))]

    const proctorEvents = userIds.length > 0
      ? await db.collection('proctor_events')
          .find({
            session_kind: 'exam',
            $or: [
              { session_id: { $in: sessionIds } },
              { user_id: { $in: userIds } },
            ],
          })
          .sort({ created_at: 1 })
          .toArray()
      : []

    // Group events by user
    const eventsByUser: Record<string, any[]> = {}
    for (const evt of proctorEvents) {
      const uid = evt.user_id
      if (!eventsByUser[uid]) eventsByUser[uid] = []
      eventsByUser[uid].push(evt)
    }

    // Fetch user profiles
    const users = userIds.length > 0
      ? await (await usersCol()).find({ id: { $in: userIds } } as never).toArray()
      : []
    const userMap = new Map(users.map((u: any) => [u.id, u]))

    // Build candidate report
    const candidates = submissions.map((sub: any) => {
      const user = userMap.get(sub.user_id)
      return {
        user_id: sub.user_id,
        name: user?.fullName || user?.name || sub.email || 'Unknown',
        email: sub.email || user?.email || null,
        score: sub.score,
        max_score: sub.max_score,
        has_pending_review: sub.has_pending_review || false,
        score_released: sub.score_released || false,
        id_photo: sub.id_photo || null,
        face_photo: sub.face_photo || null,
        device_info: sub.device_info || null,
        submitted_at: sub.created_at,
        proctor_events: eventsByUser[sub.user_id] || [],
        event_count: (eventsByUser[sub.user_id] || []).length,
      }
    })

    // Event type summary
    const eventTypeCounts: Record<string, number> = {}
    for (const evt of proctorEvents) {
      const t = evt.event_type || 'unknown'
      eventTypeCounts[t] = (eventTypeCounts[t] || 0) + 1
    }

    return NextResponse.json({
      exam: {
        id: exam.id,
        title: exam.title,
        level: exam.level,
        duration: exam.duration,
      },
      candidates,
      event_type_summary: eventTypeCounts,
      total_candidates: candidates.length,
      total_events: proctorEvents.length,
    })
  } catch (e) {
    console.error('[proctor-report] error:', e)
    return NextResponse.json({ error: 'Failed to generate proctor report' }, { status: 500 })
  }
}
