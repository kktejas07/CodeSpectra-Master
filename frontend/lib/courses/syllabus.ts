/** Required modules so a generated course cannot skip a whole topic family. */

import {
  CATALOG_SUBJECTS,
  COURSE_LEVELS,
  DOMAIN_STEM,
  SOFTWARE_FAMILIES,
  SOFTWARE_STEM,
  familyFor,
  findSubject,
  levelKey,
  trackFor,
} from '@/lib/courses/catalog'

export { CATALOG_SUBJECTS, COURSE_LEVELS, INDUSTRIES, subjectsForIndustry } from '@/lib/courses/catalog'
export const MIN_LESSONS_PER_MODULE = 6

export function syllabusFamily(techStack: string): string {
  return familyFor(techStack)
}

export function requiredModules(techStack: string, level = ''): string[] {
  return [...trackFor(techStack, level).modules]
}

export function defaultCourseTitle(tech: string, level: string): string {
  return trackFor(tech, level).title(tech)
}

export function trackBrief(tech: string, level: string): string {
  return trackFor(tech, level).brief
}

export function sanitizeCourseTitle(aiTitle: string, tech: string, level: string): string {
  const fallback = defaultCourseTitle(tech, level)
  const t = (aiTitle || '').trim()
  if (!t) return fallback
  const family = syllabusFamily(tech)
  const lv = levelKey(level)
  const dsaOk = family === 'language' && lv === 'intermediate'
  if (!dsaOk && /dsa|data structures|mastery/i.test(t)) return fallback
  return t
}

const MINUTES_PER_LESSON = 10
const MB_PER_LESSON = 12

export function estimateCourse(tech: string, level: string) {
  const modules = requiredModules(tech, level)
  const minLessons = modules.length * MIN_LESSONS_PER_MODULE
  const estimatedHours = Math.round((minLessons * MINUTES_PER_LESSON) / 6) / 10
  return {
    title: defaultCourseTitle(tech, level),
    brief: trackBrief(tech, level),
    family: syllabusFamily(tech),
    industry: findSubject(tech)?.industry || 'software',
    modules,
    moduleCount: modules.length,
    minLessons,
    estimatedHours,
  }
}

export function estimateCatalog(techs?: string[], levels?: string[]) {
  const subjects = techs?.length ? techs : CATALOG_SUBJECTS.map(s => s.name)
  const lvls = levels?.length ? levels : [...COURSE_LEVELS]
  let courses = 0
  let lessons = 0
  let hours = 0
  for (const tech of subjects) {
    for (const level of lvls) {
      courses++
      const e = estimateCourse(tech, level)
      lessons += e.minLessons
      hours += e.estimatedHours
    }
  }
  return {
    courses,
    lessons,
    hours: Math.round(hours),
    gb: Math.round((lessons * MB_PER_LESSON) / 1024 * 10) / 10,
    subjects: subjects.length,
    industries: new Set(subjects.map(s => findSubject(s)?.industry || familyFor(s))).size,
  }
}

function norm(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function slugify(s: string): string {
  return norm(s).replace(/\s+/g, '-').slice(0, 80) || 'topic'
}

export function courseIdFor(techStack: string, level: string): string {
  return slugify(`${techStack}-${level || 'beginner'}`)
}

function stemsFor(tech: string): string[] {
  return SOFTWARE_FAMILIES.has(syllabusFamily(tech)) ? SOFTWARE_STEM : DOMAIN_STEM
}

export function lessonStub(moduleTitle: string, stem: string, tech: string, level: string) {
  const software = SOFTWARE_FAMILIES.has(syllabusFamily(tech))
  const examples = software
    ? `working ${tech} examples`
    : `realistic ${tech} workplace examples`
  return {
    title: `${moduleTitle}: ${stem}`,
    slug: slugify(`${moduleTitle}-${stem}`),
    description: stem,
    content: `Teach "${moduleTitle}" focusing on "${stem}" in ${tech} at ${level} level. Cover the topic completely with ${examples}. Do not assume the student already knows this module. Do not skip subtopics or say details are out of scope.`,
    duration: 720,
    free: false,
    videoType: 'ai' as const,
  }
}

export function defaultLessons(moduleTitle: string, tech: string, level: string) {
  return stemsFor(tech).map(stem => lessonStub(moduleTitle, stem, tech, level))
}

function sectionMatchesModule(section: { title?: string; slug?: string }, mod: string): boolean {
  const t = norm(section.title || section.slug || '')
  const key = norm(mod)
  return t === key || t.includes(key) || key.includes(t)
}

export function padCurriculum(
  tech: string,
  level: string,
  sections: Array<{ title?: string; slug?: string; description?: string; lessons?: any[] }>,
): typeof sections {
  const required = requiredModules(tech, level)
  const out = (sections || []).filter(s => required.some(mod => sectionMatchesModule(s, mod)))

  for (const mod of required) {
    let section = out.find(s => sectionMatchesModule(s, mod))
    if (!section) {
      out.push({ title: mod, slug: slugify(mod), description: `${tech} — ${mod}`, lessons: defaultLessons(mod, tech, level) })
      continue
    }
    const lessons = Array.isArray(section.lessons) ? [...section.lessons] : []
    if (lessons.length < MIN_LESSONS_PER_MODULE) {
      const titles = new Set(lessons.map(l => norm(l.title || '')))
      for (const stub of defaultLessons(mod, tech, level)) {
        if (lessons.length >= MIN_LESSONS_PER_MODULE) break
        if (titles.has(norm(stub.title))) continue
        lessons.push(stub)
        titles.add(norm(stub.title))
      }
      section.lessons = lessons
    }
  }
  return out
}
