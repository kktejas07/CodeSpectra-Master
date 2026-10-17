/**
 * Server-only course rules: what a learner is allowed to see (no quiz answer
 * keys), how lesson completion is proven, and when a certificate can issue.
 *
 * Source of truth:
 *   - lesson completion  -> `lesson_completions` rows that carry `evidence`
 *     (written only by POST /completions after the activity checks below)
 *   - quiz passes        -> `quiz_results` rows (graded here from the stored key)
 *   - legacy records (pre-verification) still count — see deriveCompletionStatus
 * Anything the browser sends as "progress" is ignored for these decisions.
 */
import type { Db, Document } from 'mongodb'
import { fallbackModuleQuiz, normalizeQuizQuestions, type ModuleQuizQuestion } from '@/lib/courses/module-quiz'

export const QUIZ_PASS_PERCENT = 80

/** Failed module-quiz attempts allowed per module within QUIZ_COOLDOWN_MS. */
export const QUIZ_MAX_FAILED_ATTEMPTS = 3
export const QUIZ_COOLDOWN_MS = 60 * 60 * 1000

/**
 * May the learner take this module quiz now? `recentFailedAt` are the ISO
 * submit times of failed attempts on this module (any age; filtered here).
 * Returns the wait in seconds when the cap is hit.
 */
export function quizAttemptGate(
  recentFailedAt: string[],
  now: Date,
  max = QUIZ_MAX_FAILED_ATTEMPTS,
  windowMs = QUIZ_COOLDOWN_MS,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const since = now.getTime() - windowMs
  const times = recentFailedAt
    .map((t) => new Date(t).getTime())
    .filter((t) => Number.isFinite(t) && t > since)
    .sort((a, b) => a - b)
  if (times.length < max) return { ok: true }
  // Free again once the oldest attempt inside the window ages out.
  const oldest = times[times.length - max]
  return { ok: false, retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now.getTime()) / 1000)) }
}

/**
 * What a graded attempt may reveal: on a pass, the answer key and
 * explanations; on a fail, only which questions were right, so retakes
 * can't just copy the key.
 */
export function revealQuizResults<T extends { correctAnswer: number; explanation?: string }>(
  results: T[],
  passed: boolean,
): Array<Omit<T, 'correctAnswer' | 'explanation'> & { correctAnswer: number | null; explanation?: string }> {
  if (passed) return results
  return results.map(({ correctAnswer: _c, explanation: _e, ...rest }) => ({ ...rest, correctAnswer: null }))
}

/** Lesson ids are used as Mongo field-path segments; only allow safe ones. */
export const SAFE_KEY_RE = /^[A-Za-z0-9_-]{1,120}$/

export type CourseLesson = {
  id?: string
  title?: string
  duration?: number
  url?: string
  videoUrl?: string
  textContent?: string
  script?: Array<{ title?: string; content?: unknown }>
  [k: string]: unknown
}
export type CourseSection = {
  title?: string
  lessons?: CourseLesson[]
  quiz?: unknown
  [k: string]: unknown
}

export function courseSections(course: Document | null | undefined): CourseSection[] {
  return Array.isArray(course?.sections) ? (course!.sections as CourseSection[]) : []
}

export function allLessonIds(course: Document): string[] {
  return courseSections(course).flatMap((s) =>
    (Array.isArray(s.lessons) ? s.lessons : []).map((l) => (typeof l?.id === 'string' ? l.id : '')).filter(Boolean),
  )
}

export function findLesson(course: Document, lessonId: string): { lesson: CourseLesson; sectionIndex: number } | null {
  const sections = courseSections(course)
  for (let i = 0; i < sections.length; i++) {
    const lesson = (sections[i].lessons || []).find((l) => l?.id === lessonId)
    if (lesson) return { lesson, sectionIndex: i }
  }
  return null
}

/**
 * The graded quiz for a module: the stored quiz, or the same offline quiz the
 * player has always shown when a module has none. Empty when the module has
 * no lessons (nothing to test).
 */
export function sectionQuizKey(course: Document, sectionIndex: number): ModuleQuizQuestion[] {
  const section = courseSections(course)[sectionIndex]
  if (!section) return []
  const lessons = Array.isArray(section.lessons) ? section.lessons : []
  const stored = normalizeQuizQuestions(section.quiz)
  if (stored.length > 0) return stored
  if (lessons.length === 0) return []
  return fallbackModuleQuiz(String(section.title || 'Module'), lessons, String(course.title || ''))
}

/** Course as learners may see it: every module quiz without `correct`/`explanation`. */
export function publicCourse<T extends Document>(course: T): T {
  const sections = courseSections(course)
  if (sections.length === 0) return { ...course, _id: undefined }
  return {
    ...course,
    _id: undefined,
    sections: sections.map((s, i) => ({
      ...s,
      quiz: sectionQuizKey(course, i).map((q) => ({ id: q.id, type: q.type, question: q.question, options: q.options })),
    })),
  }
}

function lessonText(lesson: CourseLesson): string {
  if (typeof lesson.textContent === 'string' && lesson.textContent.trim()) return lesson.textContent
  if (Array.isArray(lesson.script)) {
    return lesson.script
      .map((s) => `${s?.title || ''} ${Array.isArray(s?.content) ? s.content.join(' ') : String(s?.content ?? '')}`)
      .join(' ')
  }
  return ''
}

export function lessonHasText(lesson: CourseLesson): boolean {
  return lessonText(lesson).trim().length > 0
}

export function lessonHasVideo(lesson: CourseLesson): boolean {
  return !!(lesson.videoUrl || lesson.url)
}

export function lessonDurationSec(lesson: CourseLesson): number {
  const d = Number(lesson.duration)
  return Number.isFinite(d) && d > 0 ? Math.floor(d) : 0
}

/** Seconds of active time on the page needed before a "read" completion counts. */
export function minReadSeconds(lesson: CourseLesson): number {
  const words = lessonText(lesson).split(/\s+/).filter(Boolean).length
  // ~250 wpm, allow skimming at 2.5x; never less than 15 s, never more than 4 min.
  return Math.max(15, Math.min(240, Math.round((words / 250) * 60 * 0.4)))
}

/**
 * Seconds of active watch time needed before a "watched" completion counts.
 * Allows up to 2x playback speed. Unknown duration: 30 s of real watching.
 */
export function minWatchSeconds(lesson: CourseLesson): number {
  const d = lessonDurationSec(lesson)
  return d > 0 ? Math.max(5, Math.floor(d * 0.45)) : 30
}

/** Heartbeats further apart than this don't add active time (tab closed / idle). */
export const MAX_BEAT_GAP_SEC = 20

export type CompletionStatus = {
  totalLessons: number
  lessonsDone: number
  lessonsLeft: number
  quizzesTotal: number
  quizzesPassed: number
  quizzesLeft: number
  passedSections: number[]
  bestScores: Record<number, number>
  completedLessonIds: string[]
  /** Lessons counted from pre-verification records (grandfathered). */
  legacyLessonIds: string[]
  /** Module quizzes counted from pre-verification records (grandfathered). */
  legacySections: number[]
  /** true when any of the counted progress came from legacy records. */
  legacy: boolean
}

/** A `lesson_completions` row as read for completion decisions. */
export type CompletionRow = { lessonId?: unknown; evidence?: unknown }
/** A `quiz_results` row as read for completion decisions. */
export type QuizRow = { sectionIndex?: unknown; score?: unknown; passed?: unknown }
/** The legacy, browser-written fields of a `course_progress` row. */
export type LegacyProgress = { completedModules?: unknown; quizScores?: unknown } | null | undefined

/**
 * Grandfathering: before server-verified progress, lessons were marked done by
 * a bare request (rows without `evidence`) and module passes were written by
 * the browser into `course_progress.completedModules` / `quizScores`.
 * Those records still count for that learner (`legacy: true`), so nobody has
 * to redo finished work. Nothing written today looks like that: POST
 * /completions always stores `evidence`, POST /progress never writes
 * `completedModules`/`quizScores`, and quiz-submit only inserts graded rows.
 */
export function isLegacyCompletion(row: CompletionRow): boolean {
  return row.evidence === undefined || row.evidence === null
}

/** Pure completion rule over already-loaded records (unit-tested). */
export function deriveCompletionStatus(
  course: Document,
  completions: CompletionRow[],
  quizResults: QuizRow[],
  legacyProgress?: LegacyProgress,
): CompletionStatus {
  const lessonIds = allLessonIds(course)
  const verifiedSet = new Set<string>()
  const legacySet = new Set<string>()
  for (const c of completions) {
    const id = typeof c.lessonId === 'string' ? c.lessonId : ''
    if (!id) continue
    if (isLegacyCompletion(c)) legacySet.add(id)
    else verifiedSet.add(id)
  }
  const completedLessonIds = lessonIds.filter((id) => verifiedSet.has(id) || legacySet.has(id))
  const legacyLessonIds = completedLessonIds.filter((id) => !verifiedSet.has(id))

  const bestScores: Record<number, number> = {}
  const passed = new Set<number>()
  for (const r of quizResults) {
    const i = Number(r.sectionIndex)
    if (!Number.isInteger(i)) continue
    const score = Number(r.score) || 0
    bestScores[i] = Math.max(bestScores[i] ?? 0, score)
    if (r.passed === true) passed.add(i)
  }

  const sections = courseSections(course)
  const quizSections = sections.map((_, i) => i).filter((i) => sectionQuizKey(course, i).length > 0)

  // Legacy browser-recorded module passes (only for real quiz modules of this course).
  const legacyPassed = new Set<number>()
  const legacyModules = Array.isArray(legacyProgress?.completedModules) ? (legacyProgress!.completedModules as unknown[]) : []
  const legacyScores =
    legacyProgress?.quizScores && typeof legacyProgress.quizScores === 'object'
      ? (legacyProgress.quizScores as Record<string, unknown>)
      : {}
  for (const m of legacyModules) {
    const i = Number(m)
    if (!Number.isInteger(i) || !quizSections.includes(i)) continue
    legacyPassed.add(i)
    const s = Number(legacyScores[String(i)])
    if (Number.isFinite(s) && s >= 0) bestScores[i] = Math.max(bestScores[i] ?? 0, Math.min(100, Math.round(s)))
  }

  const passedSections = quizSections.filter((i) => passed.has(i) || legacyPassed.has(i))
  const legacySections = passedSections.filter((i) => !passed.has(i))

  return {
    totalLessons: lessonIds.length,
    lessonsDone: completedLessonIds.length,
    lessonsLeft: lessonIds.length - completedLessonIds.length,
    quizzesTotal: quizSections.length,
    quizzesPassed: passedSections.length,
    quizzesLeft: quizSections.length - passedSections.length,
    passedSections,
    bestScores,
    completedLessonIds,
    legacyLessonIds,
    legacySections,
    legacy: legacyLessonIds.length > 0 || legacySections.length > 0,
  }
}

/** Read the server-recorded state (plus grandfathered legacy records) for one learner in one course. */
export async function courseCompletionStatus(db: Db, course: Document, userId: string): Promise<CompletionStatus> {
  const courseId = String(course.id)
  const [completions, results, progress] = await Promise.all([
    db.collection('lesson_completions')
      .find({ courseId, userId }, { projection: { lessonId: 1, evidence: 1 } })
      .toArray(),
    db.collection('quiz_results')
      .find({ courseId, userId }, { projection: { sectionIndex: 1, score: 1, passed: 1 } })
      .toArray(),
    db.collection('course_progress').findOne(
      { courseId, userId },
      { projection: { completedModules: 1, quizScores: 1 } },
    ),
  ])
  return deriveCompletionStatus(course, completions as CompletionRow[], results as QuizRow[], progress as LegacyProgress)
}

/** Unique index so concurrent completions can't double-insert (idempotent; safe to call often). */
let completionIndex: Promise<unknown> | null = null
export function ensureCourseIndexes(db: Db): Promise<unknown> {
  if (!completionIndex) {
    completionIndex = Promise.all([
      db.collection('lesson_completions').createIndex(
        { courseId: 1, userId: 1, lessonId: 1 },
        { unique: true, name: 'lesson_completions_unique' },
      ),
      db.collection('quiz_results').createIndex(
        { courseId: 1, userId: 1, sectionIndex: 1 },
        { name: 'quiz_results_user_section' },
      ),
    ]).catch((e) => {
      // Existing duplicates (legacy rows) make the unique build fail; upserts still keep new writes single.
      console.error('[course indexes]', e)
    })
  }
  return completionIndex
}
