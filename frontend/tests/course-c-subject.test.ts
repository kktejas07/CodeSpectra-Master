/**
 * C is its own subject, not C#/C++. Guards the two things that made the first
 * C batch wrong: findSubject('C') resolving to C# (norm() strips '#'), and the
 * generic language track teaching OOP instead of pointers and manual memory.
 */
import { describe, expect, it } from 'vitest'
import { findSubject } from '@/lib/courses/catalog'
import { defaultCourseTitle, requiredModules } from '@/lib/courses/syllabus'

describe('C subject', () => {
  it('resolves C and C# to different subjects', () => {
    expect(findSubject('C')?.name).toBe('C')
    expect(findSubject('C#')?.name).toBe('C#')
    expect(findSubject('C++')?.name).toBe('C++')
  })

  it('teaches pointers and manual memory, not OOP', () => {
    const beginner = requiredModules('C', 'beginner')
    const joined = beginner.join(' | ')
    expect(joined).toMatch(/Pointers/)
    expect(joined).toMatch(/Dynamic memory: malloc/)
    expect(joined).toMatch(/Structs, unions, and enums/)
    expect(joined).not.toMatch(/Object-oriented/)
    expect(beginner.length).toBeGreaterThanOrEqual(6)
  })

  it('covers the whole beginner → expert path', () => {
    expect(defaultCourseTitle('C', 'beginner')).toBe('C Fundamentals')
    expect(defaultCourseTitle('C', 'intermediate')).toMatch(/Data Structures/)
    expect(requiredModules('C', 'advanced').join(' ')).toMatch(/Undefined behaviour/)
    expect(requiredModules('C', 'expert').join(' ')).toMatch(/sockets/i)
  })
})
