import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { knowledgeOnLibraryChange } from '@/lib/rag/hooks'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  try {
    const db = await getMongoDb()
    const course = await db.collection('courses').findOne({ id })
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }
    return NextResponse.json({ data: course })
  } catch (e) {
    console.error('[admin/courses/[id]]', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  try {
    const body = await request.json()
    const db = await getMongoDb()

    // Don't update _id
    const { _id, ...updateData } = body
    updateData.updated_at = new Date().toISOString()

    const result = await db.collection('courses').updateOne(
      { id },
      { $set: updateData }
    )
    knowledgeOnLibraryChange('course', id)

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    const updatedCourse = await db.collection('courses').findOne({ id })
    return NextResponse.json({ data: updatedCourse })
  } catch (e) {
    console.error('[admin/courses/[id]]', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  try {
    const db = await getMongoDb()
    
    // Lazy import so POST/GET path does not load Remotion/worker deps.
    const { clearCourseVideos } = await import('@/lib/courses/process-job')
    await clearCourseVideos(id)
    
    const result = await db.collection('courses').deleteOne({ id })
    knowledgeOnLibraryChange('course', id)
    
    await db.collection('generation_jobs').deleteMany({ courseId: id })
    await db.collection('course_progress').deleteMany({ courseId: id })
    await db.collection('course_enrollments').deleteMany({ courseId: id })

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }
    
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[admin/courses/[id]]', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
