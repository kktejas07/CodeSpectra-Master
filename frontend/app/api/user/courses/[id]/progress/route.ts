import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface UserProgress {
  courseId: string
  userId: string
  enrolledAt: string
  completedModules: number[]
  quizScores: Record<number, number>
  currentModule: number
  currentLesson: number
  skippedToFinal: boolean
  finalExamScore?: number
  certificateUrl?: string
  completedAt?: string
  lastAccessedAt: string
}

// GET - Load user progress for a course
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: courseId } = await params

  try {
    const db = await getMongoDb()
    const progress = await db.collection('course_progress').findOne({
      courseId,
      userId: user.id,
    })

    if (!progress) {
      // Return default progress
      return NextResponse.json({
        courseId,
        userId: user.id,
        enrolledAt: new Date().toISOString(),
        completedModules: [],
        quizScores: {},
        currentModule: 0,
        currentLesson: 0,
        skippedToFinal: false,
        lastAccessedAt: new Date().toISOString(),
      })
    }

    return NextResponse.json(progress)
  } catch (e) {
    console.error('[progress] GET error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST - Save user progress for a course
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: courseId } = await params

  try {
    const body = await request.json()
    const db = await getMongoDb()

    const updateData: Partial<UserProgress> = {
      courseId,
      userId: user.id,
      lastAccessedAt: new Date().toISOString(),
      ...body,
    }

    // Upsert progress
    await db.collection('course_progress').updateOne(
      { courseId, userId: user.id },
      {
        $set: updateData,
        $setOnInsert: {
          enrolledAt: new Date().toISOString(),
        },
      },
      { upsert: true }
    )

    // Check if all modules completed
    const course = await db.collection('courses').findOne({ id: courseId })
    if (course) {
      const totalModules = course.sections?.length || 0
      const completedModules = body.completedModules || []
      
      if (totalModules > 0 && completedModules.length === totalModules && !body.completedAt) {
        updateData.completedAt = new Date().toISOString()
        await db.collection('course_progress').updateOne(
          { courseId, userId: user.id },
          { $set: { completedAt: updateData.completedAt } }
        )
      }
    }

    return NextResponse.json({ success: true, progress: updateData })
  } catch (e) {
    console.error('[progress] POST error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
