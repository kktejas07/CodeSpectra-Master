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

/** The cover a course *should* have, based on its subject — independent of what's stored. */
export function resolveCourseCover(course: Parameters<typeof courseHaystack>[0]): string {
  const hay = courseHaystack(course)
  for (const rule of COVER_RULES) if (rule.re.test(hay)) return `/${rule.cover}.jpg`
  return `/${DEFAULT_COVER}.jpg`
}

/**
 * A stored cover only counts as a custom poster if it is NOT one of the generic
 * /public/courses jpgs (e.g. a generated SVG data URL). Those are preserved.
 */
export function isCustomCover(stored?: string | null): boolean {
  if (!stored) return false
  return !COURSE_COVERS.some(c => stored === `/${c}.jpg`)
}

/**
 * The cover to actually display for a course: keep a custom poster, but correct
 * any of the generic covers that were assigned by the old buggy matcher.
 */
export function effectiveCourseCover(course: { image?: string | null } & Parameters<typeof courseHaystack>[0]): string {
  if (isCustomCover(course.image)) return course.image!
  return resolveCourseCover(course)
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
