import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { generateLessonVideo } from '@/lib/courses/lesson-video'
import { lessonAudioPath, saveLessonAudio } from '@/lib/courses/lesson-audio'
import { lessonVideoPath } from '@/lib/courses/lesson-mp4'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { topic, courseId, sectionIndex, lessonIndex, techStack } = await request.json()

    if (!topic) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 })
    }

    const generated = await generateLessonVideo({ topic, techStack })

    if (courseId && sectionIndex != null && lessonIndex != null) {
      const db = await getMongoDb()
      const course = await db.collection('courses').findOne({ id: courseId })

      if (course) {
        const sections = [...(course.sections || [])]
        const lesson = sections[sectionIndex]?.lessons?.[lessonIndex]
        if (lesson) {
          await saveLessonAudio(courseId, lesson.id, generated.audioBuffer)
          const { renderAndStoreLessonMp4 } = await import('@/lib/courses/render-mp4')
          await renderAndStoreLessonMp4({
            courseId,
            lessonId: lesson.id,
            script: generated.script,
            audio: generated.audioBuffer,
          })
          sections[sectionIndex].lessons[lessonIndex] = {
            ...lesson,
            textContent: generated.textContent,
            script: generated.script,
            audioUrl: lessonAudioPath(courseId, lesson.id),
            videoUrl: lessonVideoPath(courseId, lesson.id),
            videoType: 'ai',
            type: 'video',
            duration: generated.durationSeconds,
          }

          await db.collection('courses').updateOne(
            { id: courseId },
            { $set: { sections, updated_at: new Date().toISOString() } }
          )
        }
      }
    }

    return NextResponse.json({
      success: true,
      script: generated.script,
      audioUrl: `data:audio/mpeg;base64,${generated.audioBuffer.toString('base64')}`,
      totalDurationFrames: generated.script.reduce((n, s) => n + s.durationInFrames, 0),
      totalDurationSeconds: generated.durationSeconds,
      message: `Generated ${generated.script.length}-slide MP4 (~${generated.durationSeconds}s) for "${topic}"`,
    })

  } catch (e) {
    console.error('[generate-video] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
