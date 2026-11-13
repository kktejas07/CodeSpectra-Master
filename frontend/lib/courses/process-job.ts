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
/** A running job whose worker stopped beating for this long is an orphan.
 *  Workers stamp the job's heartbeatAt every 4s → 2 min = 30 missed beats. */
export const ORPHAN_JOB_MS = 2 * 60 * 1000
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
  // Only genuinely abandoned work. Workers now stamp the running job's
  // heartbeatAt every 4s (see writeWorkerHeartbeat), so 2 minutes = 30 missed
  // beats. Blanket-requeueing every 'running' job would be fine for one
  // replica but, with several, a starting replica would steal healthy jobs
  // from its siblings.
  const cutoff = new Date(Date.now() - ORPHAN_JOB_MS).toISOString()
  const running = await db.collection('generation_jobs').find({
    status: 'running',
    $or: [
      { heartbeatAt: { $lt: cutoff } },
      { heartbeatAt: { $exists: false }, startedAt: { $lt: cutoff } },
    ],
  }).toArray()
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

/** Atomically take the oldest pending job. One job per worker process.
 *
 * The old version also bailed out when ANY job was running anywhere
 * (`if (running) return null`), which made every replica past the first sit
 * idle — extra replicas bought zero throughput. The atomic findOneAndUpdate on
 * `status: 'pending'` is already enough to hand each worker a distinct job.
 */
export async function claimNextPendingJob(): Promise<{ id: string } | null> {
  const db = await getMongoDb()
  // Recover work abandoned by a dead/restarted replica before claiming, so a
  // killed render returns to the queue in ~2 min instead of waiting 3 hours.
  await requeueOrphanRunningJobs()

  const claimed = await db.collection('generation_jobs').findOneAndUpdate(
    { status: 'pending' },
    { $set: { status: 'running', startedAt: new Date().toISOString() } },
    // `priority` lets a batch jump the queue (e.g. a subject the catalog needs
    // to be complete); jobs without the field sort after everything else.
    { sort: { priority: -1, startedAt: 1 }, returnDocument: 'after' },
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
    // Scoped practice-question job (lib/courses/problem-video.ts): render ONLY
    // its lesson ids, never the whole catalog syllabus of that course.
    const scopeIds: string[] | null = Array.isArray((job as any)?.practiceLessonIds)
      ? ((job as any).practiceLessonIds as unknown[]).map(String)
      : null
    const lessonsFor = (s: any): any[] => {
      const ls = Array.isArray(s?.lessons) ? s.lessons : []
      return scopeIds ? ls.filter((l: any) => scopeIds.includes(String(l?.id))) : ls
    }
    const completedTexts: { title: string; textContent: string }[] = []
    let completedItems = 0
    let failedItems = 0
    const totalItems = sections.reduce((sum: number, s: any) => sum + lessonsFor(s).length, 0)

    await addLog(`Starting detailed MP4 generation for ${totalItems} lessons (~${targetMinutes} min each: script + voiceover + render)`)

    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const section = sections[sIdx]
      // Scoped job: walk the FULL lesson array (so lIdx stays valid for the
      // write-back below) but SKIP lessons outside the scope; unscoped jobs
      // process everything as before.
      for (let lIdx = 0; lIdx < (section.lessons?.length || 0); lIdx++) {
        const lesson = section.lessons[lIdx]
        if (scopeIds && !scopeIds.includes(String(lesson?.id))) continue

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

        // Stage-tagged, bounded retry: one transient hiccup (a 429 storm, a
        // Chrome/ffmpeg render timeout, a blip in object storage) retries with
        // backoff instead of failing the whole lesson; a real failure names
        // its stage so an admin can tell LLM/TTS/render/storage at a glance.
        const stageOf = (e: unknown): string => String((e as { stage?: string })?.stage || '') || 'unknown'
        const MAX_LESSON_ATTEMPTS = 3
        let lessonDone = false
        for (let attempt = 1; attempt <= MAX_LESSON_ATTEMPTS && !lessonDone; attempt++) {
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
          let ttsOk = audio != null || Boolean(script?.length) // silent render is allowed

          if (script?.length && audio) {
            if (String(textContent || '')) completedTexts.push({ title: lessonTitle, textContent: String(textContent || '') })
            await addLog(`Rendering MP4: ${section.title} > ${lesson.title}`)
          } else if (script?.length) {
            // Script exists but audio is missing — render silent instead of
            // regenerating the whole lesson for a TTS hiccup.
            if (String(textContent || '')) completedTexts.push({ title: lessonTitle, textContent: String(textContent || '') })
            ttsOk = false
            await addLog(`Rendering MP4 (silent — no audio): ${section.title} > ${lesson.title}`, 'warning')
          } else {
            await addLog(`Generating: ${section.title} > ${lesson.title} (script + voiceover + MP4)`)
            console.log('[course-worker] lesson', lesson.title)
            const ctx = buildLessonContext(sections, sIdx, lIdx, course, completedTexts)
            let generated: Awaited<ReturnType<typeof generateLessonVideo>>
            try {
              generated = await generateLessonVideo({ topic, techStack, targetMinutes, context: ctx })
            } catch (e: any) {
              e.stage = 'llm'
              throw e
            }
            ttsOk = generated.ttsOk !== false
            if (ttsOk) {
              try {
                await saveLessonAudio(job.courseId, lesson.id, generated.audioBuffer)
              } catch (e: any) {
                e.stage = 'storage'
                throw e
              }
            } else {
              await addLog(`Voiceover unavailable — rendering silent: ${lesson.title}`, 'warning')
            }
            script = stripQuizSlides(generated.script || [])
            audio = ttsOk ? generated.audioBuffer : null
            textContent = stripEmbeddedQuizzes(generated.textContent || "")
            durationSeconds = generated.durationSeconds
            takeaways = generated.takeaways || []
            quickCheck = generated.quickCheck || { recall: '', apply: '', stretch: '' }
            nextTeaser = generated.nextTeaser || ''
            chapters = generated.chapters || []
            completedTexts.push({ title: lessonTitle, textContent: String(textContent || '') })
          }

          if (!script?.length) {
            const err = new Error('Missing script for MP4 render')
            ;(err as any).stage = 'llm'
            throw err
          }

          const vtt = vttFromSlides(script)
          try {
            await saveLessonCaptions(job.courseId, lesson.id, vtt)
          } catch {
            // Captions are a nicety, not a gate — never fail the lesson over a VTT write.
          }

          const { renderAndStoreLessonMp4 } = await import('@/lib/courses/render-mp4')
          let mp4: { bytes: number; stored: 'object' | 'mongo' }
          try {
            mp4 = await renderAndStoreLessonMp4({
              courseId: job.courseId,
              lessonId: lesson.id,
              script,
              ...(audio ? { audio } : {}),
            })
          } catch (e: any) {
            // Remotion/Chrome failures vs object-storage failures, by message.
            const msg = String(e.message || '')
            ;(e as any).stage = /chrome|render|ffmpeg|mp4/i.test(msg) ? 'render' : 'storage'
            throw e
          }

          const latest = await db.collection('courses').findOne({ id: job.courseId })
          const updatedSections = [...(latest?.sections || sections)]
          updatedSections[sIdx] = {
            ...updatedSections[sIdx],
            lessons: updatedSections[sIdx].lessons.map((l: any, i: number) => i !== lIdx ? l : {
              ...l,
              textContent,
              script,
              // Silent lessons have no stored audio — don't point audioUrl at a 404.
              audioUrl: ttsOk ? lessonAudioPath(job.courseId, lesson.id) : null,
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
          lessonDone = true
          await addLog(
            `Completed: ${lesson.title} (MP4 ${(mp4.bytes / 1_000_000).toFixed(1)}MB ${mp4.stored === 'object' ? 'object storage' : 'Mongo'})`,
            'success',
          )
        } catch (e: any) {
          if (attempt < MAX_LESSON_ATTEMPTS) {
            // Transient hiccup: back off past most per-minute 429 windows,
            // park the shared cooldown, and retry this lesson.
            const waitMs = 30_000 * attempt
            await addLog(
              `Retrying ${lesson.title} in ${Math.round(waitMs / 1000)}s — [${stageOf(e)}] ${e.message} (attempt ${attempt}/${MAX_LESSON_ATTEMPTS})`,
              'warning',
            )
            await new Promise(r => setTimeout(r, waitMs))
          } else {
            failedItems++
            await addLog(`Failed: ${lesson.title} — [${stageOf(e)}] ${e.message} (after ${MAX_LESSON_ATTEMPTS} attempts)`, 'error')
          }
        }
        }

        await db.collection('generation_jobs').updateOne(
          { id: jobId },
          { $set: { completedItems, failedItems, progress: Math.round((completedItems / totalItems) * 100), heartbeatAt: new Date().toISOString() } },
        )

        await new Promise(r => setTimeout(r, 500))
      }

      // Unstop-style: quiz after module videos. Practice-question jobs are
      // scoped — they attached question lessons, they don't (re)grade every
      // catalog module.
      if (scopeIds) continue

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
  const at = new Date().toISOString()
  await db.collection('generation_worker_heartbeat').updateOne(
    { id: HEARTBEAT_ID },
    {
      $set: {
        id: HEARTBEAT_ID,
        at,
        hostname: process.env.HOSTNAME || 'course-worker',
        currentJobId: currentJobId || null,
      },
    },
    { upsert: true },
  )
  // Per-job liveness. Without this the job's heartbeatAt only moved once per
  // lesson (~30 min), so a healthy long render and a dead worker looked the
  // same and orphan detection had to wait out a 3-hour window.
  if (currentJobId) {
    await db.collection('generation_jobs')
      .updateOne({ id: currentJobId, status: 'running' }, { $set: { heartbeatAt: at } })
      .catch(() => {})
  }
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
