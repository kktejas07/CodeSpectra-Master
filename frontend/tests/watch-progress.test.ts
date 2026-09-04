import { describe, it, expect } from 'vitest'
import { resumeSeconds, shouldAutoComplete, pickResumeLessonId } from '@/lib/courses/watch-progress'

describe('resumeSeconds', () => {
  it('ignores tiny or finished positions', () => {
    expect(resumeSeconds(3)).toBe(0)
    expect(resumeSeconds(600, 600)).toBe(0)
    expect(resumeSeconds(120, 600)).toBe(120)
  })
})

describe('shouldAutoComplete', () => {
  it('marks complete at 90% of a real-length video', () => {
    expect(shouldAutoComplete(540, 600)).toBe(true)
    expect(shouldAutoComplete(100, 600)).toBe(false)
    expect(shouldAutoComplete(9, 10)).toBe(false)
  })
})

describe('pickResumeLessonId', () => {
  it('prefers last watched, else first incomplete', () => {
    const ids = ['a', 'b', 'c']
    expect(pickResumeLessonId(ids, 'b', new Set(['a']))).toBe('b')
    expect(pickResumeLessonId(ids, undefined, new Set(['a']))).toBe('b')
    expect(pickResumeLessonId(ids, undefined, new Set(ids))).toBe('a')
  })
})
