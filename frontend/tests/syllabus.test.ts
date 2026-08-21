import { describe, it, expect } from 'vitest'
import { courseIdFor, padCurriculum, requiredModules, syllabusFamily, MIN_LESSONS_PER_MODULE } from '@/lib/courses/syllabus'

describe('requiredModules', () => {
  it('gives Java the full language+DSA map, not a 3-lesson intro', () => {
    const mods = requiredModules('Java')
    expect(mods.length).toBeGreaterThanOrEqual(20)
    expect(mods.some(m => /hash/i.test(m))).toBe(true)
    expect(mods.some(m => /graph/i.test(m))).toBe(true)
    expect(mods.some(m => /dynamic programming/i.test(m))).toBe(true)
  })

  it('does not force DSA onto AWS', () => {
    expect(syllabusFamily('AWS')).toBe('cloud')
    expect(requiredModules('AWS').some(m => /IAM/i.test(m))).toBe(true)
    expect(requiredModules('AWS').some(m => /linked list/i.test(m))).toBe(false)
  })
})

describe('padCurriculum', () => {
  it('fills missing modules and pads thin 3-lesson sections', () => {
    const padded = padCurriculum('Python', 'beginner', [
      { title: 'Arrays and dynamic lists', lessons: [{ title: 'Intro' }, { title: 'Append' }, { title: 'Index' }] },
    ])
    expect(padded.length).toBe(requiredModules('Python').length)
    const arrays = padded.find(s => /array/i.test(s.title || ''))
    expect((arrays?.lessons || []).length).toBeGreaterThanOrEqual(MIN_LESSONS_PER_MODULE)
  })

  it('namespaces course ids by level so Java beginner ≠ Java advanced', () => {
    expect(courseIdFor('Java', 'Beginner')).toBe('java-beginner')
    expect(courseIdFor('Java', 'Advanced')).toBe('java-advanced')
  })
})
