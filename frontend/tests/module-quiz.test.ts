import { describe, expect, it } from 'vitest'
import {
  fallbackModuleQuiz,
  normalizeQuizQuestions,
  parseQuizLessonId,
  quizLessonId,
} from '@/lib/courses/module-quiz'

describe('module-quiz', () => {
  it('round-trips quiz lesson ids', () => {
    expect(quizLessonId(2)).toBe('quiz__2')
    expect(parseQuizLessonId('quiz__2')).toBe(2)
    expect(parseQuizLessonId('abc')).toBeNull()
  })

  it('normalizes correctAnswer alias and strips junk', () => {
    const qs = normalizeQuizQuestions({
      questions: [
        { question: 'Q?', options: ['a', 'b'], correctAnswer: 1, explanation: 'because' },
        { question: '', options: ['a'] },
      ],
    })
    expect(qs).toHaveLength(1)
    expect(qs[0].correct).toBe(1)
  })

  it('builds a fallback quiz with 5 questions', () => {
    const qs = fallbackModuleQuiz('Node Basics', [{ title: 'What is Node?' }, { title: 'npm' }], 'Node.js')
    expect(qs.length).toBe(5)
    expect(qs[0].options.length).toBeGreaterThanOrEqual(2)
  })
})
