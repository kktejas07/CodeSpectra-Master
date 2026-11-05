/**
 * Resume + finish any in-flight course video jobs WITHOUT regenerating problems.
 *
 * Requeues orphan `running` jobs (the worker treats a stale heartbeat as a
 * crash), then claims + processes every `pending` job to completion. This
 * reuses already-attached lessons (processVideoJob skips lessons that already
 * have a videoUrl) and re-renders only what's missing — so it's safe to re-run
 * after a wedged render.
 *
 * Usage:  npx tsx scripts/resume-video-jobs.ts
 * Env:    MONGODB_URI  (local) — everything else via .env.local
 */
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

async function main() {
  const { requeueOrphanRunningJobs, claimNextPendingJob, processVideoJob } = await import('@/lib/courses/process-job')
  const { getMongoDb } = await import('@/lib/mongodb')

  const requeued = await requeueOrphanRunningJobs()
  console.log(`[resume] requeued ${requeued} orphan running job(s)`)

  const db = await getMongoDb()
  let processed = 0
  // Process one job at a time (the worker is single-flight); stop when none pending.
  while (true) {
    const claimed = await claimNextPendingJob()
    if (!claimed) break
    processed++
    console.log(`[resume] processing ${claimed.id}`)
    try {
      await processVideoJob(claimed.id)
      console.log(`[resume] finished ${claimed.id}`)
    } catch (e) {
      console.error(`[resume] job ${claimed.id} failed:`, e instanceof Error ? e.message : e)
    }
  }
  console.log(`[resume] done — processed ${processed} job(s)`)

  // Final state of every practice video job + attached lessons.
  const jobs = await db.collection('generation_jobs').find({ type: 'video' }).toArray()
  for (const j of jobs) {
    console.log(`[job] ${j.id} ${j.status} course=${j.courseId} ${j.completedItems}/${j.totalItems} (failed ${j.failedItems})`)
  }
}

main().catch(e => { console.error('[resume] fatal:', e); process.exit(1) })
