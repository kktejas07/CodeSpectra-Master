/**
 * lib/courses/problem-video.ts — pure builders (no Mongo):
 *  lesson id / section shape, problem → lesson mapping, scoped job doc.
 */
import { describe, expect, it } from 'vitest'
import {
  PRACTICE_SECTION_TITLE,
  buildPracticeVideoJobDoc,
  practiceLessonId,
  practiceQuestionLesson,
  practiceSectionMeta,
  type PracticeProblemInput,
} from '@/lib/courses/problem-video'

const p: PracticeProblemInput = {
  id: 'abc',
  title: 'Inverted Sliding Window Sum',
  difficulty: 'hard',
  topics: ['Two Pointers', 'Sliding Window'],
  statement_md: 'Given an array, find the max subarray sum of exactly K elements.\n## Examples\nInput: 1 2 3 4, K=2 → Output: 7',
  constraints: '1 <= K <= n <= 10^5',
  example_explanation: 'The window [3,4] sums to 7, the maximum over all K-windows.',
}

describe('practiceLessonId', () => {
  it('is stable and namespaced', () => {
    expect(practiceLessonId('abc')).toBe('q-abc')
    expect(practiceLessonId('abc')).toBe(practiceLessonId('abc'))
  })
})

describe('practiceSectionMeta', () => {
  it('slugs the coordinate into the section', () => {
    const m = practiceSectionMeta('Kubernetes', 'Advanced')
    expect(m.title).toBe(PRACTICE_SECTION_TITLE)
    expect(m.slug).toBe('practice-questions-kubernetes-advanced')
    expect(m.description).toContain('Kubernetes')
  })
})

describe('practiceQuestionLesson', () => {
  it('maps a problem to a course lesson with rich content', () => {
    const l = practiceQuestionLesson(p, 'Kubernetes', 'Advanced')
    expect(l.id).toBe('q-abc')
    expect(l.title).toBe('Q: Inverted Sliding Window Sum')
    expect(l.type).toBe('video')
    expect(l.videoType).toBe('ai')
    expect(l.free).toBe(true)
    const c = String(l.content)
    expect(c).toContain('Inverted Sliding Window Sum')
    expect(c).toContain('Two Pointers, Sliding Window')
    expect(c).toContain('1 <= K <= n <= 10^5')
    expect(c).toContain('Walk through the core idea')
  })

  it('tolerates minimal problems (no statement/constraints)', () => {
    const l = practiceQuestionLesson({ id: 'x', title: 'Tiny' }, 'SQL', 'Beginner')
    expect(l.id).toBe('q-x')
    expect(String(l.content)).toContain('Tiny')
    expect(String(l.content)).not.toContain('Constraints:')
  })
})

describe('buildPracticeVideoJobDoc', () => {
  it('produces a pending scoped video job', () => {
    const j = buildPracticeVideoJobDoc({
      courseId: 'kubernetes-advanced',
      courseTitle: 'Kubernetes — Advanced',
      lessonIds: ['q-abc', 'q-def'],
      requestedBy: 'admin-1',
    })
    expect(j.courseId).toBe('kubernetes-advanced')
    expect(j.type).toBe('video')
    expect(j.status).toBe('pending')
    expect(j.totalItems).toBe(2)
    expect(j.practiceLessonIds).toEqual(['q-abc', 'q-def'])
    expect(j.requestedBy).toBe('admin-1')
    expect(Array.isArray(j.logs)).toBe(true)
  })

  it('omits requestedBy when not given', () => {
    const j = buildPracticeVideoJobDoc({ courseId: 'c', courseTitle: 'T', lessonIds: ['q-1'] })
    expect(j.requestedBy).toBeUndefined()
    expect(j.totalItems).toBe(1)
  })
})
