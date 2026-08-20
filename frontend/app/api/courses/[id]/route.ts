import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { id } = await params
  try {
    const db = await getMongoDb()
    const course = await db.collection('courses').findOne({ id })
    if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Real enrolled count from course_enrollments
    const enrolled = await db.collection('course_enrollments').countDocuments({ courseId: id })
    const userEnrolled = (await db.collection('course_enrollments').countDocuments({
      courseId: id,
      userId: gate.user.id,
    })) > 0

    return NextResponse.json({ data: { ...course, _id: undefined, enrolled, userEnrolled } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { id } = await params
  try {
    const db = await getMongoDb()
    const course = await db.collection('courses').findOne({ id })
    if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await db.collection('course_enrollments').updateOne(
      { courseId: id, userId: gate.user.id },
      {
        $set: { courseId: id, userId: gate.user.id, email: gate.user.email, enrolledAt: new Date().toISOString() },
      },
      { upsert: true },
    )
    const enrolled = await db.collection('course_enrollments').countDocuments({ courseId: id })
    return NextResponse.json({ ok: true, enrolled })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { id } = await params
  try {
    const db = await getMongoDb()
    await db.collection('course_enrollments').deleteOne({ courseId: id, userId: gate.user.id })
    const enrolled = await db.collection('course_enrollments').countDocuments({ courseId: id })
    return NextResponse.json({ ok: true, enrolled })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
