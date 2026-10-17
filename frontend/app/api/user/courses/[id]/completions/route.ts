import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET - Get completed lessons for a course
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: courseId } = await params

  try {
    const db = await getMongoDb()
    const completions = await db.collection('lesson_completions')
      .find({ courseId, userId: user.id })
      .toArray()

    return NextResponse.json({
      completedLessons: completions.map(c => c.lessonId),
    })
  } catch (e) {
    console.error('[completions] GET error:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

// POST - Mark lesson as complete
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: courseId } = await params

  try {
    const { lessonId } = await request.json()

    if (!lessonId) {
      return NextResponse.json({ error: 'lessonId required' }, { status: 400 })
    }

    const db = await getMongoDb()

    // Check if already completed
    const existing = await db.collection('lesson_completions').findOne({
      courseId,
      userId: user.id,
      lessonId,
    })

    if (existing) {
      return NextResponse.json({ success: true, message: 'Already completed' })
    }

    // Mark as complete
    await db.collection('lesson_completions').insertOne({
      courseId,
      userId: user.id,
      lessonId,
      completedAt: new Date().toISOString(),
    })

    return NextResponse.json({ success: true, message: 'Lesson completed' })
  } catch (e) {
    console.error('[completions] POST error:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
