/**
 * Expand a legacy (pre-generator) course to its subject's curriculum plan.
 *
 * Three seed courses predate the generator and have no `curriculumPlan`
 * (C++ DSA, Full Stack Web Development, Python for AI & ML) — 2–4 modules and
 * 3–4 lessons each, while every generated course carries its plan's modules and
 * 6–8 lessons per module.
 *
 * This appends the modules the plan requires and pads thin modules to the
 * minimum, WITHOUT touching existing modules or lessons, so finished videos
 * (kept per lesson id in `course_lesson_video`) survive. Existing sections are
 * matched by normalised title; a plan module that already exists is skipped.
 *
 *   npx tsx scripts/expand-course-curriculum.ts --course-id cpp-dsa --tech "C++" --level intermediate --dry-run
 *   npx tsx scripts/expand-course-curriculum.ts --course-id cpp-dsa --tech "C++" --level intermediate --enqueue
 *
 * `--enqueue` adds a normal generation job so the worker renders only lessons
 * that have no video yet (it skips lessons with a videoUrl).
 */
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()

import { randomUUID } from 'node:crypto'
import { buildCatalogCourse } from '../lib/courses/build-course'
import { defaultLessons, MIN_LESSONS_PER_MODULE, requiredModules } from '../lib/courses/syllabus'
import { fallbackModuleQuiz } from '../lib/courses/module-quiz'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const has = (n: string) => process.argv.includes(`--${n}`)

const norm = (s: unknown) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** A plan module counts as already covered when every significant word of its
 *  title appears somewhere in the course's existing section titles, so
 *  "Linked Lists & Stacks" covers "Linked lists" but not "Stacks and queues". */
function covers(existingTitles: string[], moduleTitle: string): boolean {
  const have = existingTitles.map(norm).join(' ')
  const words = norm(moduleTitle)
    .split(' ')
    .filter((w) => w.length > 3)
  if (!words.length) return existingTitles.some((t) => norm(t).startsWith(norm(moduleTitle)))
  return words.every((w) => have.includes(w))
}

async function main() {
  const courseId = arg('course-id')
  const tech = arg('tech')
  const level = arg('level') || 'beginner'
  if (!courseId || !tech) throw new Error('--course-id and --tech are required')

  const { getMongoDb } = await import('../lib/mongodb')
  const db = await getMongoDb()
  const course = await db.collection('courses').findOne({ id: courseId })
  if (!course) throw new Error(`course ${courseId} not found`)

  const sections: any[] = Array.isArray(course.sections) ? [...course.sections] : []
  const plan = requiredModules(tech, level)

  // 1) Append every planned module the course does not already cover.
  const added: string[] = []
  const existingTitles = () => sections.map((s) => String(s.title || ''))
  for (const mod of plan) {
    if (covers(existingTitles(), mod)) continue
    const lessons = defaultLessons(mod, tech, level).map((l: any) => ({
      id: randomUUID(),
      title: l.title,
      slug: String(l.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      description: l.description || '',
      content: '',
      duration: l.duration || 720,
      free: false,
      type: 'video' as const,
      videoType: 'ai' as const,
    }))
    sections.push({
      title: mod,
      slug: String(mod).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      description: `${tech} — ${mod}`,
      lessons,
      quiz: fallbackModuleQuiz(mod, lessons as any, tech),
    })
    added.push(mod)
  }

  // 2) Pad thin modules to the house minimum so a 3-lesson module is not a stub.
  const padded: string[] = []
  for (const s of sections) {
    const lessons = Array.isArray(s.lessons) ? s.lessons : []
    if (lessons.length >= MIN_LESSONS_PER_MODULE) continue
    const have = new Set(lessons.map((l: any) => norm(l.title)))
    for (const stub of defaultLessons(s.title, tech, level)) {
      if (lessons.length >= MIN_LESSONS_PER_MODULE) break
      if (have.has(norm(stub.title))) continue
      lessons.push({
        id: randomUUID(),
        title: stub.title,
        slug: String(stub.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        description: stub.description || '',
        content: '',
        duration: stub.duration || 720,
        free: false,
        type: 'video' as const,
        videoType: 'ai' as const,
      })
      have.add(norm(stub.title))
    }
    s.lessons = lessons
    padded.push(String(s.title))
  }

  const beforeSections = (Array.isArray(course.sections) ? course.sections : []).length
  const beforeLessons = (Array.isArray(course.sections) ? course.sections : []).reduce(
    (n: number, s: any) => n + (s.lessons?.length || 0),
    0,
  )
  const afterLessons = sections.reduce((n, s) => n + (s.lessons?.length || 0), 0)
  const missingVideos = sections.reduce(
    (n, s) => n + (s.lessons || []).filter((l: any) => !l.videoUrl).length,
    0,
  )
  const built = buildCatalogCourse(tech, level)

  console.log(JSON.stringify({
    course: course.title,
    id: courseId,
    tech,
    level,
    sectionsBefore: beforeSections,
    sectionsAfter: sections.length,
    lessonsBefore: beforeLessons,
    lessonsAfter: afterLessons,
    modulesAdded: added,
    modulesPadded: padded,
    lessonsWithoutVideo: missingVideos,
    titleFromBuilder: built.course.title,
    dryRun: !has('apply'),
  }, null, 2))

  if (!has('apply')) return

  const curriculumPlan = {
    title: built.course.title,
    modules: sections.map((s) => ({ title: s.title, lessonCount: (s.lessons || []).length })),
    totalLessons: afterLessons,
    estimatedHours: Math.round((afterLessons * 10) / 60),
    artifacts: ['syllabus', 'curriculum', 'video', 'audio', 'captions'],
  }
  await db.collection('courses').updateOne(
    { id: courseId },
    {
      $set: {
        sections,
        curriculumPlan,
        sessions: sections.length,
        duration: `${Math.round((afterLessons * 10) / 60)} hours`,
        updated_at: new Date().toISOString(),
      },
    },
  )
  console.log(`updated ${courseId}: ${sections.length} modules, ${afterLessons} lessons`)

  if (has('enqueue')) {
    const existing = await db.collection('generation_jobs').findOne(
      { courseId, status: { $in: ['pending', 'running'] } },
    )
    if (existing) {
      console.log(`job already ${existing.status} for ${courseId} — not duplicating`)
      return
    }
    const job = {
      id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      courseId,
      courseTitle: course.title,
      type: 'video',
      status: 'pending',
      progress: 0,
      totalItems: missingVideos,
      completedItems: 0,
      failedItems: 0,
      targetMinutes: 10,
      logs: [
        { timestamp: new Date().toISOString(), message: `Job created for "${course.title}"`, type: 'info' },
        { timestamp: new Date().toISOString(), message: `Queued — ${missingVideos} new lesson(s) without video`, type: 'info' },
      ],
      startedAt: new Date().toISOString(),
    }
    await db.collection('generation_jobs').insertOne(job as never)
    console.log(`enqueued ${job.id} (${missingVideos} lessons)`)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
