import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, gateErrorBody } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { notifySuperAdmins } from '@/lib/notifications'
import { knowledgeOnLibraryChange } from '@/lib/rag/hooks'
import { auditAdmin } from '@/lib/admin-audit'

export async function GET(request: NextRequest) {
  const gate = await requireSuperAdmin() // SEC-029: enforces admin 2FA
  if ('error' in gate) return NextResponse.json(gateErrorBody(gate), { status: gate.status })

  try {
    const db = await getMongoDb()
    const courses = await db.collection('courses').find({}).sort({ created_at: -1 }).toArray()
    return NextResponse.json({ data: courses })
  } catch (e) {
    console.error('[admin/courses]', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireSuperAdmin() // SEC-029: enforces admin 2FA
  if ('error' in gate) return NextResponse.json(gateErrorBody(gate), { status: gate.status })
  const user = gate.user

  try {
    const body = await request.json()
    const db = await getMongoDb()

    const newCourse = {
      id: body.id || crypto.randomUUID(),
      title: body.title || 'New Course',
      description: body.description || '',
      type: body.type || 'video',
      instructor: body.instructor || 'CodeSpectra',
      level: body.level || 'beginner',
      rating: body.rating || 0,
      sessions: body.sessions || 0,
      category: body.category || 'Coding',
      tags: body.tags || [],
      image: body.image || '/courses/web.jpg',
      whatYoullLearn: body.whatYoullLearn || [],
      sections: body.sections || [],
      enrolled: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    await db.collection('courses').insertOne(newCourse)
    knowledgeOnLibraryChange('course', newCourse.id)
    
    // Send notification
    await notifySuperAdmins({
      type: 'content.course_generated',
      title: 'Course Generated',
      message: `A new course "${newCourse.title}" has been successfully generated.`,
      title_i18n: { key: 'admin.courseGenerated.title' },
      message_i18n: { key: 'admin.courseGenerated.message', params: { title: String(newCourse.title) } },
      link: `/dashboard/admin/courses/${newCourse.id}`
    })

    await auditAdmin(user, 'admin.course.create', 'course', `course/${newCourse.id}`)
    return NextResponse.json({ data: newCourse })
  } catch (e) {
    console.error('[admin/courses]', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}
