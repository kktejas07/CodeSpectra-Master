/**
 * Course video worker — polls Mongo `generation_jobs` and runs ONE job at a time.
 * Does not serve HTTP. Run with COURSE_WORKER=1 (Docker) or `yarn course-worker`.
 */
import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env.local' })
loadEnv()

async function main() {
  const { claimNextPendingJob, processVideoJob, writeWorkerHeartbeat } = await import('../lib/courses/process-job')
  console.log('[course-worker] started, polling generation_jobs (one job at a time)')

  let working = false
  let currentJobId: string | null = null

  const tick = async () => {
    try {
      await writeWorkerHeartbeat(currentJobId)
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
