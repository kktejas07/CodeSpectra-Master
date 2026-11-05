/**
 * Practice-question → course-video bridge.
 *
 * Each sandbox-verified practice question becomes a lesson on the stack+level
 * catalog course; one SCOPED video job (job.practiceLessonIds) then tells the
 * course worker to render MP4s, upload them (S3/Mongo) and attach videoUrl back
 * to just those question lessons — never the whole catalog syllabus
 * (lib/courses/process-job.ts honors the scope).
 *
 * Pure builders first (unit-testable without Mongo), then the Mongo attach step.
 */
import { getMongoDb } from '@/lib/mongodb'
import { buildCatalogCourse } from '@/lib/courses/build-course'
import { courseIdFor, slugify } from '@/lib/courses/syllabus'

/** Minimum problem fields a lesson needs. */
export interface PracticeProblemInput {
  id: string
  title: string
  difficulty?: string
  topics?: string[]
  statement_md?: string
  constraints?: string | null
  example_explanation?: string | null
}

export const PRACTICE_SECTION_TITLE = 'Practice questions'

/** The practice-questions section question lessons live under. */
export function practiceSectionMeta(techStack: string, level: string): { title: string; slug: string; description: string } {
  const title = PRACTICE_SECTION_TITLE
  return {
    title,
    slug: slugify(`practice-questions-${techStack}-${level}`),
    description: `Sandbox-verified ${techStack} practice problems at the ${level} level, with AI walkthrough videos.`,
  }
}

/** Stable lesson id: re-attaching the same problem never duplicates. */
export function practiceLessonId(problemId: string): string {
  return `q-${problemId}`
}

/**
 * The course lesson for one problem. `content` is what the course worker feeds
 * the LLM as the video-script topic, so it carries the full statement,
 * constraints and a worked example — capped so one prompt never bloats.
 */
export function practiceQuestionLesson(p: PracticeProblemInput, techStack: string, level: string): Record<string, unknown> {
  const stmt = (p.statement_md || p.title || '').trim()
  const content = [
    `Explain the coding problem "${p.title}" (${p.difficulty || 'medium'}; topics: ${(p.topics || []).join(', ') || techStack}) for a ${techStack} student at the ${level} level.`,
    `Problem statement:\n${stmt.slice(0, 1500)}`,
    p.constraints ? `Constraints: ${String(p.constraints).slice(0, 400)}` : '',
    p.example_explanation ? `Worked example: ${String(p.example_explanation).slice(0, 500)}` : '',
    'Walk through the core idea, time and space complexity, and a complete worked example. Close with a hands-on challenge the viewer tries before running the reference solution.',
  ]
    .filter(Boolean)
    .join('\n\n')
  return {
    id: practiceLessonId(p.id),
    title: `Q: ${p.title}`,
    slug: slugify(`q-${p.title}`),
    description: `Practice problem (${p.difficulty || 'medium'}): ${p.title}`,
    content,
    duration: 600,
    free: true, // practice walkthroughs are open; the course page only gates paid lessons
    type: 'video' as const,
    videoType: 'ai' as const,
  }
}

/** A scoped video job: the worker renders ONLY these lessons. */
export function buildPracticeVideoJobDoc(opts: {
  courseId: string
  courseTitle: string
  lessonIds: string[]
  requestedBy?: string
}): Record<string, unknown> {
  const now = new Date().toISOString()
  return {
    id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    courseId: opts.courseId,
    courseTitle: opts.courseTitle,
    type: 'video',
    status: 'pending',
    progress: 0,
    totalItems: opts.lessonIds.length,
    completedItems: 0,
    failedItems: 0,
    targetMinutes: 10,
    practiceLessonIds: opts.lessonIds,
    logs: [
      { timestamp: now, message: `Practice-question videos queued for ${opts.lessonIds.length} lesson(s)`, type: 'info' },
      { timestamp: now, message: 'Queued — waiting for course-worker (one job at a time)', type: 'info' },
    ],
    startedAt: now,
    ...(opts.requestedBy ? { requestedBy: opts.requestedBy } : {}),
  }
}

export interface AttachPracticeVideos {
  ok: boolean
  /** Why not: 'storage' (no R2/S3), 'no-problems' (ids not found), 'db' (Mongo error). */
  reason?: string
  courseId?: string
  courseTitle?: string
  courseUrl?: string
  /** Lesson ids newly attached to the course. */
  attached: string[]
  /** Lessons already on the course this time. */
  skipped: number
  /** The new job's id when one was created. */
  jobId?: string
  /** Set when a pending/running job already covers this course. */
  existingJobId?: string
  courseCreated: boolean
}

/**
 * Ensure the coordinate's catalog course, attach one lesson per problem to its
 * practice-questions section, and queue a scoped video job. Idempotent:
 * existing lessons are skipped, an in-flight job is reported, not duplicated.
 */
export async function attachPracticeVideos(opts: {
  techStack: string
  level: string
  problemIds: string[]
  requestedBy?: string
}): Promise<AttachPracticeVideos> {
  const attached: string[] = []
  let skipped = 0
  let courseCreated = false

  try {
    const db = await getMongoDb()
    const techStack = String(opts.techStack || '').trim()
    const level = String(opts.level || '').trim()
    const courseId = courseIdFor(techStack, level)

    let course: Record<string, unknown> | null = (await db.collection('courses').findOne({ id: courseId })) as Record<string, unknown> | null
    if (!course) {
      const built = buildCatalogCourse(techStack, level)
      await db.collection('courses').insertOne(built.course as never)
      course = built.course as unknown as Record<string, unknown>
      courseCreated = true
    }
    const courseTitle = String((course as Record<string, unknown>).title || courseId)

    const ids = opts.problemIds.map(String).filter(Boolean).slice(0, 10)
    const found = ids.length
      ? await db.collection('problems').find({ id: { $in: ids }, is_published: true }).toArray()
      : []
    if (found.length === 0) {
      return { ok: false, reason: 'no-problems', attached, skipped, courseId, courseTitle, courseUrl: `/dashboard/courses/${courseId}`, courseCreated }
    }

    const meta = practiceSectionMeta(techStack, level)
    const sections = [...(Array.isArray(course.sections) ? (course.sections as unknown as Record<string, unknown>[]) : [])]
    let section = sections.find(s => String(s.title || '') === meta.title || String(s.slug || '') === meta.slug) as Record<string, unknown> | undefined
    if (!section) {
      section = { title: meta.title, slug: meta.slug, description: meta.description, lessons: [] }
      sections.push(section)
    }
    const lessons = Array.isArray(section.lessons) ? (section.lessons as Record<string, unknown>[]) : []
    const known = new Set(lessons.map(l => String(l.id || '')))
    for (const p of found) {
      const lesson = practiceQuestionLesson({
        id: String(p.id),
        title: String(p.title || ''),
        difficulty: p.difficulty,
        topics: p.topics,
        statement_md: p.statement_md,
        constraints: p.constraints,
        example_explanation: p.example_explanation,
      }, techStack, level)
      if (known.has(String(lesson.id))) {
        skipped++
        continue
      }
      lessons.push(lesson)
      attached.push(String(lesson.id))
    }
    section.lessons = lessons
    await db.collection('courses').updateOne(
      { id: courseId },
      { $set: { sections, updated_at: new Date().toISOString() } },
    )

    // One job per course: a pending/running job already covers these lessons.
    const inFlight = await db.collection('generation_jobs').findOne({
      courseId,
      status: { $in: ['pending', 'running'] },
    }, { projection: { id: 1 } })
    if (inFlight) {
      return {
        ok: true,
        courseId,
        courseTitle,
        courseUrl: `/dashboard/courses/${courseId}`,
        attached,
        skipped,
        existingJobId: String(inFlight.id),
        courseCreated,
      }
    }

    const job = buildPracticeVideoJobDoc({
      courseId,
      courseTitle,
      lessonIds: attached.length ? attached : found.map(f => practiceLessonId(String(f.id))),
      requestedBy: opts.requestedBy,
    })
    await db.collection('generation_jobs').insertOne(job as never)
    return {
      ok: true,
      courseId,
      courseTitle,
      courseUrl: `/dashboard/courses/${courseId}`,
      attached,
      skipped,
      jobId: String(job.id),
      courseCreated,
    }
  } catch {
    return { ok: false, reason: 'db', attached, skipped, courseCreated }
  }
}
