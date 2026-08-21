import { NextRequest, NextResponse, after } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { generateLessonVideo } from '@/lib/courses/lesson-video'
import { lessonAudioPath, saveLessonAudio } from '@/lib/courses/lesson-audio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { jobId } = await request.json()
    if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 })

    const db = await getMongoDb()
    const job = await db.collection('generation_jobs').findOne({ id: jobId })
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    if (job.status === 'running') {
      return NextResponse.json({ error: 'Job already running' }, { status: 409 })
    }

    // Keep the Node process alive after this response so 12 × ~1 min lessons actually finish.
    after(() => processJob(jobId).catch(e => console.error('[worker] Fatal:', e)))

    return NextResponse.json({ success: true, message: 'Job processing started' })
  } catch (e) {
    console.error('[worker] POST error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

async function processJob(jobId: string) {
  const db = await getMongoDb()
  const job = await db.collection('generation_jobs').findOne({ id: jobId })
  if (!job) return

  await db.collection('generation_jobs').updateOne(
    { id: jobId },
    { $set: { status: 'running', startedAt: new Date().toISOString() } }
  )

  const addLog = async (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const logEntry = { timestamp: new Date().toISOString(), message, type }
    await db.collection('generation_jobs').updateOne(
      { id: jobId },
      { $push: { logs: logEntry } } as any
    )
  }

  try {
    const course = await db.collection('courses').findOne({ id: job.courseId })
    if (!course) {
      await addLog('Course not found', 'error')
      await db.collection('generation_jobs').updateOne({ id: jobId }, { $set: { status: 'failed' } })
      return
    }

    const sections = course.sections || []
    let completedItems = 0
    let failedItems = 0
    const totalItems = sections.reduce((sum: number, s: any) => sum + (s.lessons?.length || 0), 0)

    await addLog(`Starting video generation for ${totalItems} lessons (each takes ~1 min — text + 3–5 min voiceover)`)

    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const section = sections[sIdx]
      for (let lIdx = 0; lIdx < (section.lessons?.length || 0); lIdx++) {
        const lesson = section.lessons[lIdx]

        if (lesson.script && lesson.script.length > 0 && lesson.audioUrl) {
          completedItems++
          await addLog(`Skipped (already has video): ${lesson.title}`, 'info')
          continue
        }

        await addLog(`Generating: ${section.title} > ${lesson.title}`)

        try {
          const topic = lesson.content || lesson.title
          const techStack = course.tags?.[0] || 'programming'
          const generated = await generateLessonVideo({ topic, techStack })

          await saveLessonAudio(job.courseId, lesson.id, generated.audioBuffer)

          const latest = await db.collection('courses').findOne({ id: job.courseId })
          const updatedSections = [...(latest?.sections || sections)]
          updatedSections[sIdx] = {
            ...updatedSections[sIdx],
            lessons: updatedSections[sIdx].lessons.map((l: any, i: number) => i !== lIdx ? l : {
              ...l,
              textContent: generated.textContent,
              script: generated.script,
              audioUrl: lessonAudioPath(job.courseId, lesson.id),
              videoType: 'ai',
              type: 'video',
              duration: generated.durationSeconds,
            }),
          }

          await db.collection('courses').updateOne(
            { id: job.courseId },
            { $set: { sections: updatedSections, updated_at: new Date().toISOString() } }
          )

          completedItems++
          await addLog(
            `Completed: ${lesson.title} (${generated.script.length} slides, ${generated.durationSeconds}s audio)`,
            'success'
          )
        } catch (e: any) {
          failedItems++
          await addLog(`Failed: ${lesson.title} — ${e.message}`, 'error')
        }

        await db.collection('generation_jobs').updateOne(
          { id: jobId },
          { $set: { completedItems, failedItems, progress: Math.round((completedItems / totalItems) * 100) } }
        )

        await new Promise(r => setTimeout(r, 500))
      }
    }

    await db.collection('generation_jobs').updateOne(
      { id: jobId },
      { $set: { status: 'completed', progress: 100, completedAt: new Date().toISOString() } }
    )
    await addLog(
      `Job completed: ${completedItems} videos generated, ${failedItems} failed`,
      failedItems > 0 ? 'warning' : 'success'
    )

  } catch (e: any) {
    await db.collection('generation_jobs').updateOne(
      { id: jobId },
      { $set: { status: 'failed', error: e.message } }
    )
    await addLog(`Job failed: ${e.message}`, 'error')
  }
}
