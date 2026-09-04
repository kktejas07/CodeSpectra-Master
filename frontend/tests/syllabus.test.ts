import { describe, it, expect } from 'vitest'
import {
  courseIdFor, padCurriculum, requiredModules, syllabusFamily, MIN_LESSONS_PER_MODULE,
  defaultCourseTitle, sanitizeCourseTitle, estimateCourse, estimateCatalog, CATALOG_SUBJECTS, COURSE_LEVELS,
} from '@/lib/courses/syllabus'

describe('requiredModules', () => {
  it('gives Java beginner fundamentals, not DSA', () => {
    const mods = requiredModules('Java', 'beginner')
    expect(mods.some(m => /syntax/i.test(m))).toBe(true)
    expect(mods.some(m => /graph/i.test(m))).toBe(false)
    expect(defaultCourseTitle('Java', 'Beginner')).toBe('Java Fundamentals')
  })

  it('puts DSA on Java intermediate, not beginner', () => {
    const mods = requiredModules('Java', 'intermediate')
    expect(mods.some(m => /hash/i.test(m))).toBe(true)
    expect(mods.some(m => /graph/i.test(m))).toBe(true)
    expect(defaultCourseTitle('Java', 'Intermediate')).toBe('Java Data Structures & Algorithms')
  })

  it('does not force DSA onto AWS', () => {
    expect(syllabusFamily('AWS')).toBe('cloud')
    expect(requiredModules('AWS', 'beginner').some(m => /IAM/i.test(m))).toBe(true)
    expect(requiredModules('AWS', 'beginner').some(m => /linked list/i.test(m))).toBe(false)
  })

  it('gives healthcare and engineering real domain modules', () => {
    expect(syllabusFamily('Healthcare Operations')).toBe('healthcare')
    expect(requiredModules('Healthcare Operations', 'beginner').some(m => /patient/i.test(m))).toBe(true)
    expect(syllabusFamily('Mechanical Engineering')).toBe('engineering')
    expect(requiredModules('Mechanical Engineering', 'beginner').some(m => /thermo/i.test(m))).toBe(true)
  })
})

describe('sanitizeCourseTitle', () => {
  it('rewrites Java DSA Mastery on beginner', () => {
    expect(sanitizeCourseTitle('Java DSA Mastery', 'Java', 'beginner')).toBe('Java Fundamentals')
  })
})

describe('padCurriculum', () => {
  it('drops DSA sections from a beginner language course', () => {
    const padded = padCurriculum('Java', 'beginner', [
      { title: 'Graphs', lessons: [{ title: 'BFS' }] },
      { title: 'Syntax, types, and values', lessons: [{ title: 'Intro' }] },
    ])
    expect(padded.some(s => /graph/i.test(s.title || ''))).toBe(false)
    expect(padded.length).toBe(requiredModules('Java', 'beginner').length)
    const syntax = padded.find(s => /syntax/i.test(s.title || ''))
    expect((syntax?.lessons || []).length).toBeGreaterThanOrEqual(MIN_LESSONS_PER_MODULE)
  })

  it('namespaces course ids by level so Java beginner ≠ Java advanced', () => {
    expect(courseIdFor('Java', 'Beginner')).toBe('java-beginner')
    expect(courseIdFor('Java', 'Advanced')).toBe('java-advanced')
  })
})

describe('catalog completeness', () => {
  it('every subject × level has modules and a non-DSA beginner title for non-DSA tracks', () => {
    for (const subject of CATALOG_SUBJECTS) {
      for (const level of COURSE_LEVELS) {
        const mods = requiredModules(subject.name, level)
        expect(mods.length, `${subject.name} ${level}`).toBeGreaterThanOrEqual(3)
        const title = defaultCourseTitle(subject.name, level)
        expect(title.length).toBeGreaterThan(0)
        if (level === 'Beginner' && subject.family !== 'language') {
          expect(/dsa|mastery/i.test(title)).toBe(false)
        }
      }
    }
  })

  it('sizes full multi-industry catalog', () => {
    const cat = estimateCatalog()
    expect(cat.subjects).toBe(CATALOG_SUBJECTS.length)
    expect(cat.courses).toBe(CATALOG_SUBJECTS.length * COURSE_LEVELS.length)
    expect(cat.industries).toBeGreaterThanOrEqual(10)
    expect(cat.lessons).toBeGreaterThan(1000)
  })
})
