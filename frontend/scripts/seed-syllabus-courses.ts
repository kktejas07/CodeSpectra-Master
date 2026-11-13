/**
 * Create the syllabus courses for a subject/level set — the same documents the
 * admin "Generate course" button builds, without needing an admin session.
 *
 *   npx tsx scripts/seed-syllabus-courses.ts --tech C \
 *     --levels beginner,intermediate,advanced,expert --priority 10 --enqueue --apply
 *
 * Courses are created instantly (modules + lessons + quizzes); `--enqueue` adds
 * one video job per course so the worker renders the lessons over time. Jobs
 * carry `priority` so a subject can jump the queue — claimNextPendingJob sorts
 * by priority first, then startedAt (jobs without the field go last).
 *
 * Idempotent: an existing course id is skipped, and a course that already has a
 * pending/running job is not queued twice.
 */
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()

import { buildCatalogCourse } from '../lib/courses/build-course'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const has = (n: string) => process.argv.includes(`--${n}`)

async function main() {
  const tech = arg('tech')
  const levels = (arg('levels') || 'beginner,intermediate,advanced,expert').split(',').map((l) => l.trim()).filter(Boolean)
  const priority = Number(arg('priority') || 0)
  if (!tech) throw new Error('--tech is required')

  const { getMongoDb } = await import('../lib/mongodb')
  const db = await getMongoDb()
  const courses = db.collection('courses')
  const jobs = db.collection('generation_jobs')

  const summary: Array<Record<string, unknown>> = []
  for (const level of levels) {
    const { course, totalLessons, plan } = buildCatalogCourse(tech, level)
    // Same shape the generator stores, so plan-vs-sections audits keep working.
    ;(course as unknown as Record<string, unknown>).curriculumPlan = {
      title: course.title,
      modules: course.sections.map((sec: { title: string; lessons: unknown[] }) => ({
        title: sec.title,
        lessonCount: sec.lessons.length,
      })),
      totalLessons,
      estimatedHours: plan.estimatedHours,
      artifacts: ['syllabus', 'curriculum', 'video', 'audio', 'captions'],
    }
    const id = String((course as { id?: string }).id || '')
    const existing = await courses.findOne({ id })
    if (existing) {
      summary.push({ id, level, skipped: 'course exists', sections: (existing.sections || []).length })
      continue
    }
    if (!has('apply')) {
      summary.push({ id, level, dryRun: true, sections: course.sections.length, lessons: totalLessons })
      continue
    }
    await courses.insertOne(course as never)
    let jobId: string | null = null
    if (has('enqueue')) {
      const dup = await jobs.findOne({ courseId: id, status: { $in: ['pending', 'running'] } })
      if (!dup) {
        jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        await jobs.insertOne({
          id: jobId,
          courseId: id,
          courseTitle: course.title,
          type: 'video',
          status: 'pending',
          priority,
          progress: 0,
          totalItems: totalLessons,
          completedItems: 0,
          failedItems: 0,
          targetMinutes: 10,
          logs: [
            { timestamp: new Date().toISOString(), message: `Job created for "${course.title}"`, type: 'info' },
            { timestamp: new Date().toISOString(), message: `Queued at priority ${priority} — ${totalLessons} lessons`, type: 'info' },
          ],
          startedAt: new Date().toISOString(),
        } as never)
      }
    }
    summary.push({ id, level, created: course.title, sections: course.sections.length, lessons: totalLessons, jobId })
  }

  console.log(JSON.stringify({ tech, levels, priority, apply: has('apply'), enqueue: has('enqueue'), summary }, null, 2))
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
