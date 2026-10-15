import { describe, it, expect } from 'vitest'
import { parseCodingAnswer, isCodingType } from '@/lib/coding-answer'

// ponytail: admin review printed the raw JSON envelope
// ({"Language":"java","code":"..."}) as the candidate's answer. These pin the
// parse-at-the-choke-point contract used by the review UI + grader prompt.

describe('parseCodingAnswer', () => {
  it('parses the java envelope from the review screenshot (capital Language)', () => {
    const raw = '{"Language":"java","code":"import java.util.*;\\r\\npublic class Main {}"}'
    const p = parseCodingAnswer(raw)
    expect(p.isStructured).toBe(true)
    expect(p.language).toBe('java')
    expect(p.code).toBe('import java.util.*;\r\npublic class Main {}')
  })

  it('parses lowercase language key', () => {
    const p = parseCodingAnswer('{"language":"python","code":"print(1)"}')
    expect(p).toMatchObject({ isStructured: true, language: 'python', code: 'print(1)' })
  })

  it('leaves plain text untouched', () => {
    const p = parseCodingAnswer('just a descriptive answer')
    expect(p).toMatchObject({ isStructured: false, code: 'just a descriptive answer' })
  })

  it('handles empty / null input', () => {
    expect(parseCodingAnswer('').isStructured).toBe(false)
    expect(parseCodingAnswer(null).code).toBe('')
  })

  it('does not treat arbitrary JSON as a code envelope', () => {
    expect(parseCodingAnswer('{"a":1}').isStructured).toBe(false)
  })
})

describe('isCodingType', () => {
  it('matches coding variants only', () => {
    expect(isCodingType('coding')).toBe(true)
    expect(isCodingType('code')).toBe(true)
    expect(isCodingType('multiple-choice')).toBe(false)
    expect(isCodingType('descriptive')).toBe(false)
  })
})
