import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET - Check enrollment status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: courseId } = await params

  try {
    const db = await getMongoDb()
    const enrollment = await db.collection('course_enrollments').findOne({
      courseId,
      userId: user.id,
    })

    return NextResponse.json({
      enrolled: !!enrollment,
      enrolledAt: enrollment?.enrolledAt,
    })
  } catch (e) {
    console.error('[enrollment] GET error:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

// POST - Enroll in course
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: courseId } = await params

  try {
    const db = await getMongoDb()

    const course = await db.collection('courses').findOne({ id: courseId }, { projection: { id: 1 } })
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

    // Atomic: only inserts when not enrolled yet, so the count can't double up.
    const r = await db.collection('course_enrollments').updateOne(
      { courseId, userId: user.id },
      {
        $setOnInsert: {
          courseId,
          userId: user.id,
          email: user.email,
          enrolledAt: new Date().toISOString(),
          status: 'active',
        },
      },
      { upsert: true },
    )
    if (r.upsertedCount === 0) {
      return NextResponse.json({ success: true, message: 'Already enrolled' })
    }

    await db.collection('courses').updateOne(
      { id: courseId },
      { $inc: { enrolled: 1 } }
    )

    return NextResponse.json({ success: true, message: 'Enrolled successfully' })
  } catch (e) {
    console.error('[enrollment] POST error:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

// DELETE - Unenroll from course
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: courseId } = await params

  try {
    const db = await getMongoDb()
    const del = await db.collection('course_enrollments').deleteOne({
      courseId,
      userId: user.id,
    })

    // Decrement only when a row was actually removed, and never below zero.
    if (del.deletedCount > 0) {
      await db.collection('courses').updateOne(
        { id: courseId, enrolled: { $gt: 0 } },
        { $inc: { enrolled: -1 } }
      )
    }

    return NextResponse.json({ success: true, message: 'Unenrolled' })
  } catch (e) {
    console.error('[enrollment] DELETE error:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
