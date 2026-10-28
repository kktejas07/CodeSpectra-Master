import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, gateErrorBody } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { knowledgeOnLibraryChange } from '@/lib/rag/hooks'
import { auditAdmin } from '@/lib/admin-audit'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdmin() // SEC-029: enforces admin 2FA
  if ('error' in gate) return NextResponse.json(gateErrorBody(gate), { status: gate.status })

  const { id } = await params
  try {
    const db = await getMongoDb()
    const course = await db.collection('courses').findOne({ id })
    if (!course) {
      return NextResponse.json({ error: 'Course not found', code: 'course_not_found' }, { status: 404 })
    }
    return NextResponse.json({ data: course })
  } catch (e) {
    console.error('[admin/courses/[id]]', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdmin() // SEC-029: enforces admin 2FA
  if ('error' in gate) return NextResponse.json(gateErrorBody(gate), { status: gate.status })
  const user = gate.user

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
      return NextResponse.json({ error: 'Course not found', code: 'course_not_found' }, { status: 404 })
    }

    const updatedCourse = await db.collection('courses').findOne({ id })
    await auditAdmin(user, 'admin.course.update', 'course', `course/${id}`)
    return NextResponse.json({ data: updatedCourse })
  } catch (e) {
    console.error('[admin/courses/[id]]', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdmin() // SEC-029: enforces admin 2FA
  if ('error' in gate) return NextResponse.json(gateErrorBody(gate), { status: gate.status })
  const user = gate.user

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
      return NextResponse.json({ error: 'Course not found', code: 'course_not_found' }, { status: 404 })
    }
    
    await auditAdmin(user, 'admin.course.delete', 'course', `course/${id}`, undefined, 'warning')
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[admin/courses/[id]]', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}
