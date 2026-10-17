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

    // Check if already enrolled
    const existing = await db.collection('course_enrollments').findOne({
      courseId,
      userId: user.id,
    })

    if (existing) {
      return NextResponse.json({ success: true, message: 'Already enrolled' })
    }

    // Enroll
    await db.collection('course_enrollments').insertOne({
      courseId,
      userId: user.id,
      email: user.email,
      enrolledAt: new Date().toISOString(),
      status: 'active',
    })

    // Increment course enrolled count
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
    await db.collection('course_enrollments').deleteOne({
      courseId,
      userId: user.id,
    })

    // Decrement course enrolled count
    await db.collection('courses').updateOne(
      { id: courseId },
      { $inc: { enrolled: -1 } }
    )

    return NextResponse.json({ success: true, message: 'Unenrolled' })
  } catch (e) {
    console.error('[enrollment] DELETE error:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
