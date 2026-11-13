/**
 * Shared cover-image + media-completion helpers for the course catalog.
 *
 * Why this exists: the catalog previously picked covers with a fragile
 * `techStack.toLowerCase().includes(key)` match in build-course.ts, where
 * "javascript" matched the "java" key first — so JavaScript courses showed a
 * Java cover, React showed a generic web cover, and most non-software subjects
 * fell back to one stale image. This module centralises that decision so every
 * surface (learner catalog, course detail, admin table, new-course builder)
 * agrees on which cover a course "should" have.
 */

/** Every cover actually shipped in /public/courses. */
export const COURSE_COVERS = [
  'c', 'cpp', 'devops', 'git', 'java', 'javascript', 'os',
  'python', 'react', 'sql', 'system', 'web',
] as const

export const DEFAULT_COVER = 'web'

/**
 * Ordered cover resolver. Rules are tried top-to-bottom against the course's
 * haystack (tech stack / category / tags / title); the FIRST rule that matches
 * wins, so more-specific keywords are listed before the ones they would
 * shadow ("javascript" before "java", "c++" before "c").
 */
const COVER_RULES: Array<{ re: RegExp; cover: (typeof COURSE_COVERS)[number] }> = [
  { re: /\bc\+\+|\bcpp\b/i, cover: 'cpp' },
  { re: /\bgit\b|\bgit[- ]?hub/i, cover: 'git' },
  { re: /\breact\b/i, cover: 'react' },
  { re: /javascript|typescript|\bjs\b/i, cover: 'javascript' },
  { re: /\bjava\b|j2ee|spring|hibernate|kotlin|android|\bscala\b/i, cover: 'java' },
  { re: /python|django|flask|machine learning|\bml\b|artificial|data science|numpy|pandas|\bai\b/i, cover: 'python' },
  { re: /\bsql\b|postgres|mongo|database|data engineer/i, cover: 'sql' },
  { re: /devops|docker|kubernetes|\bk8s\b|terraform|aws|azure|\bgcp\b|cloud|linux|jenkins/i, cover: 'devops' },
  { re: /\bnode\b|full ?stack|\bweb\b|next|frontend|html|\bcss\b/i, cover: 'web' },
  { re: /system|architecture|microservice|backend|security|design/i, cover: 'system' },
  { re: /operating ?system|\bos\b/i, cover: 'os' },
  { re: /\bc\b/i, cover: 'c' },
]

/** Flattens the text a course is "about" for cover matching. */
export function courseHaystack(course: {
  techStack?: string
  category?: string
  tags?: string[]
  title?: string
}): string {
  return [
    course.techStack,
    course.category,
    ...(Array.isArray(course.tags) ? course.tags : []),
    course.title,
  ]
    .filter(Boolean)
    .map(String)
    .join(' ')
}

/** URL of a shipped subject image. They live under /public/courses, so the
 * public path needs the directory — `/java.jpg` 404s. */
function coverUrl(key: string): string {
  return `/courses/${key}.jpg`
}

/** The cover a course *should* have, based on its subject — independent of what's stored. */
export function resolveCourseCover(course: Parameters<typeof courseHaystack>[0]): string {
  const hay = courseHaystack(course)
  for (const rule of COVER_RULES) if (rule.re.test(hay)) return coverUrl(rule.cover)
  return coverUrl(DEFAULT_COVER)
}

/**
 * A stored cover only counts as a custom poster if it is NOT one of the generic
 * /public/courses jpgs (e.g. a generated SVG data URL). Those are preserved.
 */
/** Every value that means "this is one of the shared subject images", not a poster. */
const GENERIC_COVERS = new Set(
  COURSE_COVERS.flatMap((c) => [`/courses/${c}.jpg`, `/${c}.jpg`]),
)

export function isCustomCover(stored?: string | null): boolean {
  if (!stored) return false
  return !GENERIC_COVERS.has(stored)
}

/**
 * The cover to actually display for a course.
 *
 * Order: a real poster (uploaded or generated) wins; then the shipped subject
 * art when the course's subject matched a rule (java.jpg for Java, sql.jpg for
 * SQL…); otherwise the per-course rendered poster. The last case is the fix for
 * the old fallback that pointed every Mechanical/Electrical course at the
 * web-dev mascot.
 */
export function effectiveCourseCover(course: { id?: string; image?: string | null } & Parameters<typeof courseHaystack>[0]): string {
  if (isCustomCover(course.image)) return course.image!
  const art = resolveCourseCover(course)
  if (art !== `/courses/${DEFAULT_COVER}.jpg`) return art
  if (course.id) return `/api/courses/${encodeURIComponent(course.id)}/cover`
  return art
}

/** Count lessons that have a playable MP4 (`videoUrl`) vs total, per the generator UI. */
export function courseMediaStats(course: { sections?: unknown; modules?: unknown }): {
  total: number
  mp4Ready: number
  pending: number
} {
  const sections = Array.isArray(course.sections) ? course.sections : Array.isArray(course.modules) ? course.modules : []
  const lessons = sections.flatMap((s: any) => (Array.isArray(s?.lessons) ? s.lessons : Array.isArray(s?.videos) ? s.videos : []))
  const total = lessons.length
  const mp4Ready = lessons.filter((l: any) => Boolean(l?.videoUrl || l?.url)).length
  return { total, mp4Ready, pending: Math.max(0, total - mp4Ready) }
}

/**
 * A course is "fully completed" when every lesson it promises has a playable
 * video. Stub courses (no lessons) and text courses don't promise video, so
 * they complete immediately.
 */
export function isCourseComplete(course: { type?: string; sections?: unknown; modules?: unknown }): boolean {
  const { total, mp4Ready } = courseMediaStats(course)
  if (total === 0) return true
  if (String(course?.type || '').toLowerCase() === 'text') return true
  return mp4Ready === total
}
