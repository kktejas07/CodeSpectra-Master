import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, gateErrorBody } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { generateLessonVideo, normalizeTargetMinutes } from '@/lib/courses/lesson-video'
import type { LessonContext } from '@/lib/courses/lesson-video'
import { lessonAudioPath, saveLessonAudio } from '@/lib/courses/lesson-audio'
import { lessonVideoPath } from '@/lib/courses/lesson-mp4'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const gate = await requireSuperAdmin() // SEC-029: enforces admin 2FA
  if ('error' in gate) return NextResponse.json(gateErrorBody(gate), { status: gate.status })

  try {
    const { topic, courseId, sectionIndex, lessonIndex, techStack, targetMinutes, context } = await request.json()

    if (!topic) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 })
    }

    const generated = await generateLessonVideo({
      topic,
      techStack,
      targetMinutes: normalizeTargetMinutes(targetMinutes ?? 10),
      context: (context || undefined) as LessonContext | undefined,
    })

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
            takeaways: generated.takeaways || [],
            quickCheck: generated.quickCheck || { recall: '', apply: '', stretch: '' },
            nextTeaser: generated.nextTeaser || '',
            chapters: generated.chapters || [],
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
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}
