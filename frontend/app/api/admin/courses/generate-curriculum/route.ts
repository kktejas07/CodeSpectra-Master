import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { courseIdFor } from '@/lib/courses/syllabus'
import { buildCatalogCourse } from '@/lib/courses/build-course'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// DELETE - Remove a course
export async function DELETE(request: NextRequest) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const courseId = searchParams.get('courseId')

    if (!courseId) {
      return NextResponse.json({ error: 'courseId required' }, { status: 400 })
    }

    const db = await getMongoDb()
    // Lazy import so POST path does not load Remotion/worker deps.
    const { clearCourseVideos } = await import('@/lib/courses/process-job')
    await clearCourseVideos(courseId)
    await db.collection('courses').deleteOne({ id: courseId })
    await db.collection('generation_jobs').deleteMany({ courseId })
    await db.collection('course_progress').deleteMany({ courseId })
    await db.collection('course_enrollments').deleteMany({ courseId })

    return NextResponse.json({ success: true, message: 'Course deleted' })
  } catch (e) {
    console.error('[generate-curriculum] DELETE error:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

/**
 * Create a full course from the catalog syllabus.
 * ponytail: skip LLM curriculum JSON (54+ lessons → Cloudflare/origin timeout 500).
 * Lessons get detailed scripts later in the video worker.
 */
export async function POST(request: NextRequest) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const techStack = String(body.techStack || '').trim()
    const level = String(body.level || 'beginner').toLowerCase()
    const slug = body.slug ? String(body.slug) : ''

    if (!techStack) {
      return NextResponse.json({ error: 'techStack is required' }, { status: 400 })
    }

    const db = await getMongoDb()
    const courseId = slug || courseIdFor(techStack, level)

    const existing = await db.collection('courses').findOne({ id: courseId })
    if (existing) {
      return NextResponse.json(
        { error: `Course "${techStack}" (${level}) already exists (id: ${existing.id}). Delete it or regenerate videos on that course.` },
        { status: 409 },
      )
    }

    const { course, totalLessons } = buildCatalogCourse(techStack, level)

    try {
      await db.collection('courses').insertOne(course)
    } catch (e: any) {
      if (e?.code === 11000) {
        return NextResponse.json(
          { error: `Course id "${courseId}" already exists. Delete it or pick another level.` },
          { status: 409 },
        )
      }
      throw e
    }

    console.log('[generate-curriculum] created', courseId, 'sections', course.sections.length, 'lessons', totalLessons)

    return NextResponse.json({
      success: true,
      course,
      totalLessons,
      message: `Created "${course.title}" with ${course.sections.length} modules and ${totalLessons} lessons. Ready for video generation.`,
    })
  } catch (e) {
    console.error('[generate-curriculum] error:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
