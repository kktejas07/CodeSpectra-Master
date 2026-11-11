import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, gateErrorBody } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { notifySuperAdmins } from '@/lib/notifications'
import { knowledgeOnLibraryChange } from '@/lib/rag/hooks'
import { auditAdmin } from '@/lib/admin-audit'
import { courseStatus, type CourseStatus } from '@/lib/courses/course-status'

interface JobRef { status: string; startedAt?: string }

/** Live jobs beat terminal history; within a tier the newest wins. */
function betterJob(a?: JobRef, b?: JobRef): boolean {
  if (!a) return true
  if (!b) return false
  const rank = (j: JobRef) => (j.status === 'running' ? 4 : j.status === 'pending' ? 3 : 2)
  const ra = rank(a), rb = rank(b)
  if (ra !== rb) return ra > rb
  return String(b.startedAt || '') > String(a.startedAt || '')
}

export async function GET(request: NextRequest) {
  const gate = await requireSuperAdmin() // SEC-029: enforces admin 2FA
  if ('error' in gate) return NextResponse.json(gateErrorBody(gate), { status: gate.status })

  try {
    const db = await getMongoDb()
    const [courses, jobs] = await Promise.all([
      db.collection('courses').find({}).sort({ created_at: -1 }).toArray(),
      db.collection('generation_jobs')
        .find({}, { projection: { id: 1, courseId: 1, status: 1, startedAt: 1, completedItems: 1, totalItems: 1, failedItems: 1 } })
        .sort({ startedAt: -1 })
        .limit(500)
        .toArray(),
    ])

    // Representative job per course: running > pending > newest terminal.
    const allJobs = jobs as any[]
    const refsByCourse = new Map<string, JobRef[]>()
    const repByCourse = new Map<string, any>()
    for (const j of allJobs) {
      if (!j.courseId) continue
      const refs = refsByCourse.get(j.courseId)
      if (refs) refs.push(j)
      else refsByCourse.set(j.courseId, [j])
      if (betterJob(repByCourse.get(j.courseId), j)) repByCourse.set(j.courseId, j)
    }

    const data = courses.map((c: any) => {
      const rep = repByCourse.get(c.id)
      const _job = rep ? {
        status: rep.status,
        startedAt: rep.startedAt || '',
        completedItems: rep.completedItems || 0,
        totalItems: rep.totalItems || 0,
        failedItems: rep.failedItems || 0,
      } : undefined
      return {
        ...c,
        _status: courseStatus(c, refsByCourse.get(c.id) || []) as CourseStatus,
        _job,
      }
    })

    return NextResponse.json({ data })
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
