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
  // Orphan sweeping must NOT live only in the claim path. `tick()` returns
  // early while this replica is rendering, so when every replica is busy
  // nobody ever calls claimNextPendingJob() — and a job whose worker died
  // stays "running" forever, blocking its course. (Seen live: a deploy killed
  // a worker mid-lesson and the job sat 40 min with a 40-min-old heartbeat
  // while six other replicas rendered happily.) One indexed update per minute
  // is cheap; ORPHAN_JOB_MS is 2 min, so the sweep is still conservative.
  let lastSweep = 0
  const beat = () => {
    writeWorkerHeartbeat(currentJobId).catch(() => {})
    if (Date.now() - lastSweep > 60_000) {
      lastSweep = Date.now()
      requeueOrphanRunningJobs()
        .then((n) => n && console.log('[course-worker] requeued', n, 'orphan running job(s)'))
        .catch(() => {})
    }
  }
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
