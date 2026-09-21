import { getMongoDb } from '@/lib/mongodb'
import { fallbackModuleQuiz } from '@/lib/courses/module-quiz'
import { generateModuleQuiz } from '@/lib/courses/module-quiz-generate'
import { generateLessonVideo, normalizeTargetMinutes, buildLessonContext } from '@/lib/courses/lesson-video'
import { lessonAudioPath, saveLessonAudio, deleteCourseAudio, loadLessonAudio } from '@/lib/courses/lesson-audio'
import { lessonVideoPath, deleteCourseVideos } from '@/lib/courses/lesson-mp4'
import { deleteCourseCaptions, lessonCaptionsPath, saveLessonCaptions, vttFromSlides } from '@/lib/courses/lesson-captions'
import { stripEmbeddedQuizzes, stripQuizSlides } from '@/lib/courses/strip-embedded-quizzes'

export function finalJobStatus(completedItems: number, failedItems: number): 'completed' | 'failed' {
  if (failedItems > 0 || completedItems === 0) return 'failed'
  return 'completed'
}

export const STALE_RUNNING_MS = 3 * 60 * 60 * 1000
export const WORKER_ONLINE_MS = 20_000
const HEARTBEAT_ID = 'course-video-worker'
const BUSY_STATUSES = ['pending', 'running'] as const

export function isStaleRunning(job: { status?: string; startedAt?: string; heartbeatAt?: string }, now = Date.now()): boolean {
  if (job.status !== 'running') return false
  const t = Date.parse(job.heartbeatAt || job.startedAt || '')
  if (Number.isNaN(t)) return false
  return now - t > STALE_RUNNING_MS
}

export async function findBusyJob(): Promise<{ id: string; courseTitle?: string; status: string } | null> {
  const db = await getMongoDb()
  const job = await db.collection('generation_jobs').findOne(
    { status: { $in: [...BUSY_STATUSES] } },
    { projection: { id: 1, courseTitle: 1, status: 1 } },
  )
  return job as { id: string; courseTitle?: string; status: string } | null
}

export async function requeueOrphanRunningJobs(): Promise<number> {
  const db = await getMongoDb()
  const running = await db.collection('generation_jobs').find({ status: 'running' }).toArray()
  for (const job of running) {
    await db.collection('generation_jobs').updateOne(
      { id: job.id },
      {
        $set: { status: 'pending' },
        $push: {
          logs: {
            timestamp: new Date().toISOString(),
            message: 'Requeued — worker restarted while this job was in progress',
            type: 'warning',
          },
        } as any,
      },
    )
  }
  return running.length
}

export async function recoverStaleRunningJobs(): Promise<number> {
  const db = await getMongoDb()
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS).toISOString()
  const stale = await db.collection('generation_jobs').find({
    status: 'running',
    $or: [
      { heartbeatAt: { $lt: cutoff } },
      { heartbeatAt: { $exists: false }, startedAt: { $lt: cutoff } },
    ],
  }).toArray()

  for (const job of stale) {
    await db.collection('generation_jobs').updateOne(
      { id: job.id },
      {
        $set: { status: 'failed', error: 'Stale — worker died or timed out after 3 hours' },
        $push: {
          logs: {
            timestamp: new Date().toISOString(),
            message: 'Marked failed: job was still running after 3 hours (worker likely restarted)',
            type: 'error',
          },
        } as any,
      },
    )
  }
  return stale.length
}

/** Atomically take the oldest pending job if nothing else is running. 1 job at a time. */
export async function claimNextPendingJob(): Promise<{ id: string } | null> {
  const db = await getMongoDb()
  await recoverStaleRunningJobs()
  const running = await db.collection('generation_jobs').findOne({ status: 'running' })
  if (running) return null

  const claimed = await db.collection('generation_jobs').findOneAndUpdate(
    { status: 'pending' },
    { $set: { status: 'running', startedAt: new Date().toISOString() } },
    { sort: { startedAt: 1 }, returnDocument: 'after' },
  )
  if (!claimed) return null
  const id = (claimed as { id?: string }).id
  return id ? { id: String(id) } : null
}

export async function processVideoJob(jobId: string): Promise<void> {
  const db = await getMongoDb()
  const job = await db.collection('generation_jobs').findOne({ id: jobId })
  if (!job) return

  if (job.status !== 'running') {
    await db.collection('generation_jobs').updateOne(
      { id: jobId },
      { $set: { status: 'running', startedAt: new Date().toISOString() } },
    )
  }

  const addLog = async (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    await db.collection('generation_jobs').updateOne(
      { id: jobId },
      { $push: { logs: { timestamp: new Date().toISOString(), message, type } } } as any,
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
    const targetMinutes = normalizeTargetMinutes((job as any)?.targetMinutes ?? 10)
    const completedTexts: { title: string; textContent: string }[] = []
    let completedItems = 0
    let failedItems = 0
    const totalItems = sections.reduce((sum: number, s: any) => sum + (s.lessons?.length || 0), 0)

    await addLog(`Starting detailed MP4 generation for ${totalItems} lessons (~${targetMinutes} min each: script + voiceover + render)`)

    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const section = sections[sIdx]
      for (let lIdx = 0; lIdx < (section.lessons?.length || 0); lIdx++) {
        const lesson = section.lessons[lIdx]

        if (lesson.videoUrl) {
          if (String(lesson.textContent || '')) {
            completedTexts.push({ title: String(lesson.title || ''), textContent: String(lesson.textContent || '') })
          }
          if (!lesson.captionsUrl && Array.isArray(lesson.script) && lesson.script.length) {
            try {
              const vtt = vttFromSlides(lesson.script)
              await saveLessonCaptions(job.courseId, lesson.id, vtt)
              const latest = await db.collection('courses').findOne({ id: job.courseId })
              const updatedSections = [...(latest?.sections || sections)]
              updatedSections[sIdx] = {
                ...updatedSections[sIdx],
                lessons: updatedSections[sIdx].lessons.map((l: any, i: number) =>
                  i !== lIdx ? l : { ...l, captionsUrl: lessonCaptionsPath(job.courseId, lesson.id) },
                ),
              }
              await db.collection('courses').updateOne(
                { id: job.courseId },
                { $set: { sections: updatedSections, updated_at: new Date().toISOString() } },
              )
              await addLog(`Backfilled captions: ${lesson.title}`, 'success')
            } catch (e: any) {
              await addLog(`Caption backfill failed: ${lesson.title} — ${e.message}`, 'warning')
            }
          }
          completedItems++
          await addLog(`Skipped (already has MP4): ${lesson.title}`, 'info')
          continue
        }

        try {
          const topic = lesson.content || lesson.title
          const techStack = String(course.tags?.[0] || (course as any)?.techStack || 'programming')
          const lessonTitle = String(lesson.title || '')
          let script = Array.isArray(lesson.script) ? lesson.script : null
          let textContent = lesson.textContent || ''
          let durationSeconds = Number(lesson.duration) || 0
          let takeaways: string[] = Array.isArray(lesson.takeaways) ? lesson.takeaways : []
          let quickCheck = lesson.quickCheck || { recall: '', apply: '', stretch: '' }
          let nextTeaser = String(lesson.nextTeaser || '')
          let chapters = Array.isArray(lesson.chapters) ? lesson.chapters : []
          let audio = script?.length && lesson.audioUrl
            ? (await loadLessonAudio(job.courseId, lesson.id))?.data ?? null
            : null

          if (script?.length && audio) {
            if (String(textContent || '')) completedTexts.push({ title: lessonTitle, textContent: String(textContent || '') })
            await addLog(`Rendering MP4: ${section.title} > ${lesson.title}`)
          } else {
            await addLog(`Generating: ${section.title} > ${lesson.title} (script + voiceover + MP4)`)
            console.log('[course-worker] lesson', lesson.title)
            const ctx = buildLessonContext(sections, sIdx, lIdx, course, completedTexts)
            const generated = await generateLessonVideo({ topic, techStack, targetMinutes, context: ctx })
            await saveLessonAudio(job.courseId, lesson.id, generated.audioBuffer)
            script = stripQuizSlides(generated.script || [])
            audio = generated.audioBuffer
            textContent = stripEmbeddedQuizzes(generated.textContent || "")
            durationSeconds = generated.durationSeconds
            takeaways = generated.takeaways || []
            quickCheck = generated.quickCheck || { recall: '', apply: '', stretch: '' }
            nextTeaser = generated.nextTeaser || ''
            chapters = generated.chapters || []
            completedTexts.push({ title: lessonTitle, textContent: String(textContent || '') })
          }

          if (!script?.length || !audio) throw new Error('Missing script or audio for MP4 render')

          const vtt = vttFromSlides(script)
          await saveLessonCaptions(job.courseId, lesson.id, vtt)

          const { renderAndStoreLessonMp4 } = await import('@/lib/courses/render-mp4')
          const mp4 = await renderAndStoreLessonMp4({
            courseId: job.courseId,
            lessonId: lesson.id,
            script,
            audio,
          })

          const latest = await db.collection('courses').findOne({ id: job.courseId })
          const updatedSections = [...(latest?.sections || sections)]
          updatedSections[sIdx] = {
            ...updatedSections[sIdx],
            lessons: updatedSections[sIdx].lessons.map((l: any, i: number) => i !== lIdx ? l : {
              ...l,
              textContent,
              script,
              audioUrl: lessonAudioPath(job.courseId, lesson.id),
              videoUrl: lessonVideoPath(job.courseId, lesson.id),
              captionsUrl: lessonCaptionsPath(job.courseId, lesson.id),
              videoType: 'ai',
              type: 'video',
              duration: durationSeconds || Math.round(script.reduce((n: number, s: any) => n + (s.durationInFrames || 0), 0) / 30),
              takeaways,
              quickCheck,
              nextTeaser,
              chapters,
            }),
          }

          await db.collection('courses').updateOne(
            { id: job.courseId },
            { $set: { sections: updatedSections, updated_at: new Date().toISOString() } },
          )

          completedItems++
          await addLog(
            `Completed: ${lesson.title} (MP4 ${(mp4.bytes / 1_000_000).toFixed(1)}MB ${mp4.stored === 'object' ? 'object storage' : 'Mongo'})`,
            'success',
          )
        } catch (e: any) {
          failedItems++
          await addLog(`Failed: ${lesson.title} — ${e.message}`, 'error')
        }

        await db.collection('generation_jobs').updateOne(
          { id: jobId },
          { $set: { completedItems, failedItems, progress: Math.round((completedItems / totalItems) * 100), heartbeatAt: new Date().toISOString() } },
        )

        await new Promise(r => setTimeout(r, 500))
      }

      // Unstop-style: quiz after module videos
      try {
        const latest = await db.collection('courses').findOne({ id: job.courseId })
        const sec = (latest?.sections || [])[sIdx]
        if (sec && !(Array.isArray(sec.quiz) && sec.quiz.length)) {
          await addLog(`Generating module quiz: ${sec.title}`)
          const tech = (course.tags && course.tags[0]) || course.techStack || 'programming'
          const quiz = await generateModuleQuiz({
            moduleTitle: sec.title || `Module ${sIdx + 1}`,
            lessons: (sec.lessons || []).map((l: any) => ({
              title: l.title,
              content: l.content,
              textContent: l.textContent,
            })),
            techStack: String(tech),
          })
          const sections2 = [...(latest?.sections || [])]
          sections2[sIdx] = { ...sections2[sIdx], quiz }
          await db.collection('courses').updateOne(
            { id: job.courseId },
            { $set: { sections: sections2, updated_at: new Date().toISOString() } },
          )
          await addLog(`Module quiz ready: ${sec.title} (${quiz.length} questions)`, 'success')
        }
      } catch (e: any) {
        try {
          const latest = await db.collection('courses').findOne({ id: job.courseId })
          const sec = (latest?.sections || [])[sIdx]
          if (sec && !(Array.isArray(sec.quiz) && sec.quiz.length)) {
            const tech = (course.tags && course.tags[0]) || 'programming'
            const quiz = fallbackModuleQuiz(sec.title || 'Module', sec.lessons || [], String(tech))
            const sections2 = [...(latest?.sections || [])]
            sections2[sIdx] = { ...sections2[sIdx], quiz }
            await db.collection('courses').updateOne(
              { id: job.courseId },
              { $set: { sections: sections2, updated_at: new Date().toISOString() } },
            )
            await addLog(`Module quiz fallback: ${sec.title} (${quiz.length} questions)`, 'warning')
          }
        } catch (e2: any) {
          await addLog(`Module quiz failed: ${e2.message}`, 'warning')
        }
      }
    }

    const status = finalJobStatus(completedItems, failedItems)
    await db.collection('generation_jobs').updateOne(
      { id: jobId },
      {
        $set: {
          status,
          progress: 100,
          completedAt: new Date().toISOString(),
          ...(status === 'failed'
            ? { error: `${failedItems} videos failed, ${completedItems} generated` }
            : { error: null }),
        },
      },
    )
    await addLog(
      status === 'failed'
        ? `Job failed: ${completedItems} videos generated, ${failedItems} failed — Retry remaining keeps successes; Regenerate all starts over`
        : `Job completed: ${completedItems} videos generated`,
      status === 'failed' ? 'error' : 'success',
    )
  } catch (e: any) {
    await db.collection('generation_jobs').updateOne(
      { id: jobId },
      { $set: { status: 'failed', error: e.message } },
    )
    await addLog(`Job failed: ${e.message}`, 'error')
  }
}

export async function writeWorkerHeartbeat(currentJobId?: string | null): Promise<void> {
  const db = await getMongoDb()
  await db.collection('generation_worker_heartbeat').updateOne(
    { id: HEARTBEAT_ID },
    {
      $set: {
        id: HEARTBEAT_ID,
        at: new Date().toISOString(),
        hostname: process.env.HOSTNAME || 'course-worker',
        currentJobId: currentJobId || null,
      },
    },
    { upsert: true },
  )
}

export async function readWorkerStatus(): Promise<{
  online: boolean
  heartbeatAt: string | null
  hostname: string | null
  currentJobId: string | null
}> {
  const db = await getMongoDb()
  const doc = await db.collection('generation_worker_heartbeat').findOne({ id: HEARTBEAT_ID })
  const heartbeatAt = doc?.at ? String(doc.at) : null
  const age = heartbeatAt ? Date.now() - Date.parse(heartbeatAt) : Infinity
  return {
    online: Number.isFinite(age) && age < WORKER_ONLINE_MS,
    heartbeatAt,
    hostname: doc?.hostname ? String(doc.hostname) : null,
    currentJobId: doc?.currentJobId ? String(doc.currentJobId) : null,
  }
}

export async function clearCourseVideos(courseId: string): Promise<void> {
  const db = await getMongoDb()
  const course = await db.collection('courses').findOne({ id: courseId })
  if (!course) return
  const sectionsUpdate = (course.sections || []).map((s: any) => ({
    ...s,
    lessons: (s.lessons || []).map((l: any) => ({
      ...l,
      script: [],
      textContent: null,
      audioUrl: null,
      videoUrl: null,
      captionsUrl: null,
      videoType: null,
      duration: 600,
      type: 'text',
    })),
  }))
  await db.collection('courses').updateOne(
    { id: courseId },
    { $set: { sections: sectionsUpdate, updated_at: new Date().toISOString() } },
  )
  await deleteCourseAudio(courseId)
  await deleteCourseVideos(courseId)
  await deleteCourseCaptions(courseId)
}

export async function requeueJob(jobId: string, opts?: { regenerateAll?: boolean }): Promise<{ ok: boolean; error?: string }> {
  const db = await getMongoDb()
  const job = await db.collection('generation_jobs').findOne({ id: jobId })
  if (!job) return { ok: false, error: 'Job not found' }
  if (job.status === 'completed' && !opts?.regenerateAll && !(job.failedItems > 0)) {
    return { ok: false, error: 'Job already completed' }
  }

  if (opts?.regenerateAll) await clearCourseVideos(job.courseId)

  // ponytail: regenerate-all starts a FRESH log (old per-lesson failures
  // described videos that were just deleted — keeping them misleads the
  // next run). Retry-remaining keeps appending: its history still matches
  // the videos on disk.
  const freshLog = {
    timestamp: new Date().toISOString(),
    message: opts?.regenerateAll
      ? 'Requeued — regenerating ALL videos (existing ones cleared)'
      : 'Requeued — will skip lessons that already have video',
    type: 'info',
  }
  await db.collection('generation_jobs').updateOne(
    { id: jobId },
    opts?.regenerateAll
      ? {
          $set: {
            status: 'pending',
            error: null,
            progress: 0,
            completedItems: 0,
            failedItems: 0,
            logs: [freshLog],
          },
        }
      : {
          $set: {
            status: 'pending',
            error: null,
            progress: 0,
            completedItems: 0,
            failedItems: 0,
          },
          $push: { logs: freshLog } as any,
        },
  )
  return { ok: true }
}

export async function cancelJob(jobId: string): Promise<{ ok: boolean; error?: string }> {
  const db = await getMongoDb()
  const job = await db.collection('generation_jobs').findOne({ id: jobId })
  if (!job) return { ok: false, error: 'Job not found' }
  if (job.status === 'completed') return { ok: false, error: 'Job already completed' }

  await db.collection('generation_jobs').updateOne(
    { id: jobId },
    {
      $set: { status: 'cancelled', completedAt: new Date().toISOString() },
      $push: {
        logs: {
          timestamp: new Date().toISOString(),
          message: 'Cancelled from Course Generator UI',
          type: 'warning',
        },
      } as any,
    },
  )
  return { ok: true }
}
