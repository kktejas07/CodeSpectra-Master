import { describe, expect, it } from 'vitest'
import {
  publicCourse,
  sectionQuizKey,
  minReadSeconds,
  minWatchSeconds,
  findLesson,
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

  it('whitelists résumé builder fields', () => {
    const d = sanitizeBuilderData({ summary: 'x', evil: 1, experience: [{ id: '$bad', role: 'Dev', extra: 2 }] })!
    expect(d).not.toHaveProperty('evil')
    expect(d.experience[0]).not.toHaveProperty('extra')
    expect(d.experience[0].id).toBe('item-0')
  })
})
