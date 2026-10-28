import { describe, expect, it } from 'vitest'
import {
  publicCourse,
  sectionQuizKey,
  minReadSeconds,
  minWatchSeconds,
  findLesson,
  deriveCompletionStatus,
} from '@/app/api/user/courses/_lib/course-rules'
import { sanitizeBuilderData } from '@/app/api/resumes/_lib/builder-data'

const course = {
  id: 'c1',
  title: 'Node.js',
  sections: [
    {
      title: 'Basics',
      lessons: [{ id: 'l1', title: 'Intro', duration: 600, url: 'https://x' }],
      quiz: [{ id: 'q1', question: 'Q?', options: ['a', 'b'], correct: 1, explanation: 'because' }],
    },
    { title: 'No quiz', lessons: [{ id: 'l2', title: 'Two', textContent: 'word '.repeat(1000) }] },
    { title: 'Empty', lessons: [] },
  ],
}

describe('course rules', () => {
  it('never sends answer keys to learners', () => {
    const pub = publicCourse(course) as typeof course
    const json = JSON.stringify(pub.sections)
    expect(json).not.toContain('"correct"')
    expect(json).not.toContain('because')
    expect(pub.sections[0].quiz).toHaveLength(1)
  })

  it('grades stored quizzes and the offline fallback the same way the player shows them', () => {
    expect(sectionQuizKey(course, 0)[0].correct).toBe(1)
    expect(sectionQuizKey(course, 1).length).toBeGreaterThan(0)
    expect(sectionQuizKey(course, 2)).toEqual([])
    expect((publicCourse(course) as typeof course).sections[1].quiz).toHaveLength(sectionQuizKey(course, 1).length)
  })

  it('needs real time on a lesson before it can complete', () => {
    expect(minWatchSeconds(findLesson(course, 'l1')!.lesson)).toBe(270)
    expect(minReadSeconds(findLesson(course, 'l2')!.lesson)).toBe(96)
  })

  describe('grandfathered legacy progress', () => {
    // Module 0 has a stored quiz, module 1 has the offline fallback quiz, module 2 has nothing to test.
    it('counts legacy lesson rows and legacy module passes as complete', () => {
      const st = deriveCompletionStatus(
        course,
        [{ lessonId: 'l1' }, { lessonId: 'l2', evidence: null }],
        [],
        { completedModules: [0, 1], quizScores: { 0: 90, 1: 85 } },
      )
      expect(st.lessonsLeft).toBe(0)
      expect(st.quizzesLeft).toBe(0)
      expect(st.legacy).toBe(true)
      expect(st.legacyLessonIds).toEqual(['l1', 'l2'])
      expect(st.legacySections).toEqual([0, 1])
      expect(st.bestScores[0]).toBe(90)
    })

    it('does not count a new-flow record without verification', () => {
      // New flow: lessons only count with evidence; quiz rows only when passed.
      const st = deriveCompletionStatus(course, [], [{ sectionIndex: 0, score: 40, passed: false }], {})
      expect(st.lessonsDone).toBe(0)
      expect(st.quizzesPassed).toBe(0)
      expect(st.legacy).toBe(false)
      // Legacy module ids that are not real quiz modules are ignored.
      const bogus = deriveCompletionStatus(course, [], [], { completedModules: [2, 7, 'x'] })
      expect(bogus.quizzesPassed).toBe(0)
      expect(bogus.legacy).toBe(false)
    })

    it('completes a course mixing legacy and verified records', () => {
      const st = deriveCompletionStatus(
        course,
        [{ lessonId: 'l1' }, { lessonId: 'l2', evidence: { mode: 'read', activeSeconds: 120 } }],
        [{ sectionIndex: 1, score: 100, passed: true }],
        { completedModules: [0] },
      )
      expect(st.lessonsLeft).toBe(0)
      expect(st.quizzesLeft).toBe(0)
      expect(st.legacyLessonIds).toEqual(['l1'])
      expect(st.legacySections).toEqual([0])
      expect(st.bestScores[0]).toBeUndefined()
    })
  })

  it('whitelists résumé builder fields', () => {
    const d = sanitizeBuilderData({ summary: 'x', evil: 1, experience: [{ id: '$bad', role: 'Dev', extra: 2 }] })!
    expect(d).not.toHaveProperty('evil')
    expect(d.experience[0]).not.toHaveProperty('extra')
    expect(d.experience[0].id).toBe('item-0')
  })
})
