import { getMongoDb } from '@/lib/mongodb'
import { generateLessonVideo } from '@/lib/courses/lesson-video'
import { lessonAudioPath, saveLessonAudio } from '@/lib/courses/lesson-audio'

export function finalJobStatus(completedItems: number, failedItems: number): 'completed' | 'failed' {
  if (completedItems > 0 && failedItems === 0) return 'completed'
  if (completedItems === 0) return 'failed'
  return 'completed'
}

export const STALE_RUNNING_MS = 45 * 60 * 1000
export const WORKER_ONLINE_MS = 20_000
const HEARTBEAT_ID = 'course-video-worker'
const BUSY_STATUSES = ['pending', 'running'] as const

export function isStaleRunning(job: { status?: string; startedAt?: string }, now = Date.now()): boolean {
  if (job.status !== 'running' || !job.startedAt) return false
  const started = Date.parse(job.startedAt)
  if (Number.isNaN(started)) return false
  return now - started > STALE_RUNNING_MS
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
    startedAt: { $lt: cutoff },
  }).toArray()

  for (const job of stale) {
    await db.collection('generation_jobs').updateOne(
      { id: job.id },
      {
        $set: { status: 'failed', error: 'Stale — worker died or timed out after 45 minutes' },
        $push: {
          logs: {
            timestamp: new Date().toISOString(),
            message: 'Marked failed: job was still running after 45 minutes (worker likely restarted)',
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

        await addLog(`Generating: ${section.title} > ${lesson.title} (LLM + voiceover, 1–2 min)`)
        console.log('[course-worker] lesson', lesson.title)

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
            { $set: { sections: updatedSections, updated_at: new Date().toISOString() } },
          )

          completedItems++
          await addLog(
            `Completed: ${lesson.title} (${generated.script.length} slides, ${generated.durationSeconds}s audio)`,
            'success',
          )
        } catch (e: any) {
          failedItems++
          await addLog(`Failed: ${lesson.title} — ${e.message}`, 'error')
        }

        await db.collection('generation_jobs').updateOne(
          { id: jobId },
          { $set: { completedItems, failedItems, progress: Math.round((completedItems / totalItems) * 100) } },
        )

        await new Promise(r => setTimeout(r, 500))
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
          ...(status === 'failed' ? { error: `${failedItems} videos failed, 0 generated` } : { error: null }),
        },
      },
    )
    await addLog(
      status === 'failed'
        ? `Job failed: 0 videos generated, ${failedItems} failed`
        : `Job completed: ${completedItems} videos generated, ${failedItems} failed`,
      status === 'failed' ? 'error' : failedItems > 0 ? 'warning' : 'success',
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

export async function requeueJob(jobId: string): Promise<{ ok: boolean; error?: string }> {
  const db = await getMongoDb()
  const job = await db.collection('generation_jobs').findOne({ id: jobId })
  if (!job) return { ok: false, error: 'Job not found' }
  if (job.status === 'completed') return { ok: false, error: 'Job already completed' }

  const busy = await db.collection('generation_jobs').findOne({
    status: { $in: ['pending', 'running'] },
    id: { $ne: jobId },
  })
  if (busy) return { ok: false, error: `Another job is already ${busy.status}` }

  await db.collection('generation_jobs').updateOne(
    { id: jobId },
    {
      $set: { status: 'pending', error: null, progress: job.status === 'running' ? job.progress : 0 },
      $push: {
        logs: {
          timestamp: new Date().toISOString(),
          message: 'Requeued from Course Generator UI — worker will pick this up',
          type: 'info',
        },
      } as any,
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
