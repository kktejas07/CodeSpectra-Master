/**
 * End-to-end run of the practice-question video pipeline against local infra:
 *
 *   1) generate + publish domain-stamped questions (industry × stack × level)
 *   2) attach them as course lessons + queue a SCOPED video job
 *      (lib/courses/problem-video.ts)
 *   3) run the real course worker on that job (script → TTS → Remotion render
 *      → S3/Mongo upload → videoUrl attached back to the lesson)
 *   4) verify: the MP4 is actually retrievable through the playback path
 *
 * Usage:
 *   npx tsx scripts/run-practice-videos.ts <industry> <techStack> <level> [count]
 *
 * Local-infra env (set in the shell, wins over .env.local via dotenv):
 *   MONGODB_URI_FALLBACK=mongodb://localhost:27018/
 *   INTERNAL_BACKEND_URL=http://127.0.0.1:8001
 *   S3_ENDPOINT=http://localhost:9000 S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... S3_BUCKET=codespectra S3_REGION=us-east-1
 *   GROQ_API_KEY / NVIDIA_API_KEY (LLM providers, via .env.local or env)
 */
import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env.local' })

const [industryArg, techStackArg, levelArg, countArg = '3'] = process.argv.slice(2)
if (!industryArg || !techStackArg || !levelArg) {
  console.error('usage: run-practice-videos.ts <industry> <techStack> <level> [count]')
  process.exit(1)
}

const log = (s: string) => console.log(`[run] ${s}`)

async function main() {
  const { buildDomainPracticeSpec, generateDomainProblemSet } = await import('@/lib/practice-content/domain-practice')
  const { systemPracticeUser } = await import('@/lib/practice-content/problems-generate')
  const { attachPracticeVideos } = await import('@/lib/courses/problem-video')
  const { claimNextPendingJob, processVideoJob } = await import('@/lib/courses/process-job')
  const { getMongoDb } = await import('@/lib/mongodb')

  // ── 1) generate + publish the questions ──────────────────────────────
  const spec = buildDomainPracticeSpec(industryArg as never, techStackArg, levelArg as never)
  log(`spec: ${spec.title} (difficulty ${spec.difficulty}, topics: ${spec.topics.join(', ')})`)
  const results = await generateDomainProblemSet(systemPracticeUser(), spec, Number(countArg) || 3)
  const ok = results.filter(r => r.ok && 'id' in r)
  const failed = results.filter(r => !r.ok)
  log(`published ${ok.length}/${results.length} verified problems (${failed.length} rejected: ${failed.map(f => f.reason).slice(0, 3).join(' | ')})`)
  if (!ok.length) {
    console.error('no published problems — nothing to video')
    process.exit(2)
  }

  // ── 2) attach as course lessons + queue the scoped video job ─────────
  const out = await attachPracticeVideos({
    techStack: techStackArg,
    level: levelArg,
    problemIds: ok.map(r => (r as { id: string }).id),
    requestedBy: 'run-practice-videos',
  })
  if (!out.ok) {
    console.error(`attach failed: ${out.reason}`)
    process.exit(3)
  }
  log(`course ${out.courseId} (${out.courseCreated ? 'created' : 'existing'}): attached ${out.attached.length}, skipped ${out.skipped}`)
  log(`video job: ${out.jobId ? out.jobId : `in-flight ${out.existingJobId}`}`)
  const jobId = out.jobId
  if (!jobId) {
    log('an in-flight job already covers this course — skipping the worker run')
    return
  }

  // ── 3) run the real worker loop for this job ────────────────────────
  // Claim the pending job and process it (the worker polls every 4s in prod;
  // here we drive one claim+process directly).
  const claimed = await claimNextPendingJob()
  if (!claimed || claimed.id !== jobId) {
    // Some other pending job is older — claim until ours (or mark running).
    const db = await getMongoDb()
    await db.collection('generation_jobs').updateOne({ id: jobId }, { $set: { status: 'running' } })
  }
  log(`processing job ${jobId} (this renders every question lesson: LLM script + TTS + MP4)`)
  await processVideoJob(jobId)

  // ── 4) verify: lesson has a videoUrl AND the bytes are retrievable ──
  const { lessonVideoPlayback } = await import('@/lib/courses/lesson-mp4')
  const db = await getMongoDb()
  const course = await db.collection('courses').findOne({ id: out.courseId })
  const sections = (course?.sections || []) as Array<{ title?: string; lessons?: Array<Record<string, unknown>> }>
  const practice = sections.find(s => s.title === 'Practice questions')
  const lessons = practice?.lessons || []
  let allOk = true
  for (const l of lessons) {
    const vid = await lessonVideoPlayback(out.courseId, String(l.id))
    const okL = Boolean(l.videoUrl) && vid?.bytes > 1000
    allOk = allOk && okL
    log(`lesson "${l.title}": videoUrl=${l.videoUrl ? 'yes' : 'NO'} mp4=${vid ? `${(vid.bytes / 1e6).toFixed(1)}MB` : 'MISSING'} ${okL ? '✓' : '✗'}`)
  }
  const jobDoc = await db.collection('generation_jobs').findOne({ id: jobId })
  log(`job ${jobId} → ${jobDoc?.status} (${jobDoc?.completedItems}/${jobDoc?.totalItems} completed, ${jobDoc?.failedItems} failed)`)
  log(jobDoc?.logs?.slice(-6).map((l: { message: string; type: string }) => `   [${l.type}] ${l.message}`).join('\n'))

  if (!allOk || jobDoc?.status !== 'completed') process.exit(4)
  log(`SUCCESS — ${lessons.length} question videos generated, uploaded, and attached to course ${out.courseId}`)
}

main().catch(e => {
  console.error('[run] fatal:', e)
  process.exit(1)
})
