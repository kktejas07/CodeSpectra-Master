/**
 * Course video worker — polls Mongo `generation_jobs` and runs ONE job at a time.
 * Does not serve HTTP. Run with COURSE_WORKER=1 (Docker) or `yarn course-worker`.
 */
import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env.local' })
loadEnv()

async function main() {
  const { claimNextPendingJob, processVideoJob, writeWorkerHeartbeat, requeueOrphanRunningJobs } = await import('../lib/courses/process-job')
  const orphans = await requeueOrphanRunningJobs()
  if (orphans) console.log('[course-worker] requeued', orphans, 'orphan running job(s)')
  console.log('[course-worker] started, polling generation_jobs (one job per worker)')

  let working = false
  let currentJobId: string | null = null

  // Liveness MUST NOT depend on the job loop. This file used to call
  // `await tick()` before `setInterval` existed — and `tick()` awaits
  // processVideoJob(), so the FIRST job of every process ran to completion
  // before the interval was ever registered. That job produced exactly one
  // heartbeat (written before it was claimed) and then went silent for hours,
  // so the admin UI showed "Worker Offline" (WORKER_ONLINE_MS = 20s) while the
  // worker was rendering normally. A dedicated timer fixes it regardless of how
  // long processVideoJob blocks.
  const beat = () => { writeWorkerHeartbeat(currentJobId).catch(() => {}) }
  setInterval(beat, 4000)
  beat()

  const tick = async () => {
    try {
      if (working) return
      const claimed = await claimNextPendingJob()
      if (!claimed) return
      working = true
      currentJobId = claimed.id
      console.log('[course-worker] claimed', claimed.id)
      await writeWorkerHeartbeat(claimed.id)
      try {
        await processVideoJob(claimed.id)
        console.log('[course-worker] finished', claimed.id)
      } finally {
        working = false
        currentJobId = null
        await writeWorkerHeartbeat(null).catch(() => {})
      }
    } catch (e) {
      console.error('[course-worker] tick failed:', e)
    }
  }

  await tick()
  setInterval(tick, 4000)
}

main().catch((e) => {
  console.error('[course-worker] fatal:', e)
  process.exit(1)
})
