import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { generateLessonVideo } from '@/lib/courses/lesson-video'
import { lessonAudioPath, saveLessonAudio } from '@/lib/courses/lesson-audio'
import { lessonVideoPath } from '@/lib/courses/lesson-mp4'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 600

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: courseId } = await params

  try {
    const { sectionIndex, lessonIndex } = await request.json()

    if (sectionIndex == null || lessonIndex == null) {
      return NextResponse.json({ error: 'sectionIndex and lessonIndex required' }, { status: 400 })
    }

    const db = await getMongoDb()
    const course = await db.collection('courses').findOne({ id: courseId })
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

    const sections = course.sections || []
    if (!sections[sectionIndex]) return NextResponse.json({ error: 'Section not found' }, { status: 404 })

    const lessons = sections[sectionIndex].lessons || []
    if (!lessons[lessonIndex]) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })

    const lesson = lessons[lessonIndex]

    if (lesson.videoUrl) {
      return NextResponse.json({ success: true, skipped: true, message: 'Already generated' })
    }

    const topic = lesson.content?.trim() || lesson.title
    if (!topic) {
      return NextResponse.json({ error: 'Lesson has no content/topic' }, { status: 400 })
    }

    const generated = await generateLessonVideo({
      topic,
      techStack: course.tags?.[0] || 'programming',
    })

    await saveLessonAudio(courseId, lesson.id, generated.audioBuffer)
    const { renderAndStoreLessonMp4 } = await import('@/lib/courses/render-mp4')
    await renderAndStoreLessonMp4({
      courseId,
      lessonId: lesson.id,
      script: generated.script,
      audio: generated.audioBuffer,
    })

    const sectionsUpdate = [...sections]
    const lessonsUpdate = [...sectionsUpdate[sectionIndex].lessons]
    lessonsUpdate[lessonIndex] = {
      ...lessonsUpdate[lessonIndex],
      textContent: generated.textContent,
      script: generated.script,
      audioUrl: lessonAudioPath(courseId, lesson.id),
      videoUrl: lessonVideoPath(courseId, lesson.id),
      type: 'video',
      videoType: 'ai',
      duration: generated.durationSeconds,
    }
    sectionsUpdate[sectionIndex] = { ...sectionsUpdate[sectionIndex], lessons: lessonsUpdate }

    await db.collection('courses').updateOne(
      { id: courseId },
      { $set: { sections: sectionsUpdate, updated_at: new Date().toISOString() } }
    )

    return NextResponse.json({
      success: true,
      slides: generated.script.length,
      durationSeconds: generated.durationSeconds,
      videoUrl: 'stored',
      message: `Generated ${generated.script.length}-slide MP4 (${generated.durationSeconds}s) for "${lesson.title}"`,
    })

  } catch (e) {
    console.error('[generate-lesson] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
