import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

/**
 * Learning progress for the signed-in user, stored natively in Mongo
 * (`learning_progress`). Shape:
 *   GET  /api/learning/progress            -> list of progress rows
 *   POST /api/learning/progress            -> upsert one progress row
 *   GET  /api/learning/progress/summary    -> aggregate stats (see summary/route.ts)
 */
export async function GET(request: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = await getMongoDb()
    const { searchParams } = new URL(request.url)
    const courseId = searchParams.get('courseId') || searchParams.get('course_id')
    const filter: Record<string, unknown> = { user_id: user.id }
    if (courseId) filter.course_id = courseId
    const rows = await db
      .collection('learning_progress')
      .find(filter)
      .sort({ updated_at: -1 })
      .limit(500)
      .toArray()
    return NextResponse.json({ data: rows })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch progress' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const courseId = typeof body.course_id === 'string' && body.course_id.length ? body.course_id : null
    if (!courseId) return NextResponse.json({ error: 'course_id is required' }, { status: 400 })

    const db = await getMongoDb()
    const now = new Date().toISOString()
    const completedLessons = Array.isArray(body.completed_lessons) ? body.completed_lessons : []
    const doc = {
      user_id: user.id,
      course_id: courseId,
      completed_lessons: completedLessons,
      percent: Math.min(100, Math.max(0, Number(body.percent ?? 0) || 0)),
      updated_at: now,
      created_at: now,
    }

    await db.collection('learning_progress').updateOne(
      { user_id: user.id, course_id: courseId },
      { $set: doc },
      { upsert: true },
    )
    return NextResponse.json({ ok: true, data: doc })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to save progress' }, { status: 500 })
  }
}