/**
 * Deterministic grading normalization tests (lib/grading.ts).
 * Run: npx vitest run tests/grading.test.ts
 */
import { describe, it, expect } from 'vitest'
import { answersEqual, multisetEqual, numericEqual, optionResolvedKey, canonicalObjectiveType, isObjectiveType, sanitizeTestCases, sanitizeExamQuestion } from '@/lib/grading'

describe('canonicalObjectiveType', () => {
  it('canonicalizes every accepted objective spelling', () => {
    expect(canonicalObjectiveType('multiple-choice')).toBe('mcq')
    expect(canonicalObjectiveType('MCQ')).toBe('mcq')
    expect(canonicalObjectiveType('true_false')).toBe('true_false')
    expect(canonicalObjectiveType('Multiple Response')).toBe('multiple_response')
    expect(canonicalObjectiveType('fill_blanks')).toBe('fill_blanks')
    expect(canonicalObjectiveType('fillinthe blanks')).toBe('fill_blanks')
  })

  it('treats code/descriptive as free text', () => {
    expect(canonicalObjectiveType('coding')).toBe('free_text')
    expect(canonicalObjectiveType('descriptive')).toBe('free_text')
    expect(isObjectiveType('coding')).toBe(false)
  })
})

describe('numericEqual', () => {
  it('matches decimals and trailing units', () => {
    expect(numericEqual('14', '14.0')).toBe(true)
    expect(numericEqual('72 km/h', '72')).toBe(true)
    expect(numericEqual('₹600', '600')).toBe(true)
    expect(numericEqual('12.5%', '12.5')).toBe(true)
  })

  it('does not match differing numbers', () => {
    expect(numericEqual('14', '15')).toBe(false)
    expect(numericEqual('O(log n)', 'O(n)')).toBe(false)
  })
})

describe('optionResolvedKey', () => {
  const opts = ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)']

  it('resolves option text and letter index to the same slot', () => {
    expect(optionResolvedKey('O(log n)', opts)).toBe(optionResolvedKey('B', opts))
    expect(optionResolvedKey('b', opts)).toBe('opt:1')
  })

  it('returns null for unknown values', () => {
    expect(optionResolvedKey('N/A', opts)).toBeNull()
    expect(optionResolvedKey('', opts)).toBeNull()
    expect(optionResolvedKey('B')).toBeNull()
  })
})

describe('answersEqual — "same answer, different format"', () => {
  const opts = ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)']

  it('letter index matches option text', () => {
    expect(answersEqual('B', 'O(log n)', opts)).toBe(true)
    expect(answersEqual('O(log n)', 'B', opts)).toBe(true)
  })

  it('numeric answer equals numeric text', () => {
    expect(answersEqual('14.0', '14')).toBe(true)
    expect(answersEqual('₹600', '600')).toBe(true)
  })

  it('is whitespace-insensitive', () => {
    expect(answersEqual('O(log  n)', 'O(log n)')).toBe(true)
    expect(answersEqual('  o(log n) ', 'O(log n)')).toBe(true)
  })

  it('still rejects genuinely different answers', () => {
    expect(answersEqual('A', 'O(log n)', opts)).toBe(false)
    expect(answersEqual('O(1)', 'O(n)', opts)).toBe(false)
  })

  it('empty correct answer is never a pass', () => {
    expect(answersEqual('anything', '')).toBe(false)
    expect(answersEqual('', '')).toBe(false)
  })
})

describe('multisetEqual', () => {
  it('compares comma lists order-insensitively', () => {
    expect(multisetEqual('Insert, Lookup, Delete', 'delete,Insert,lookup')).toBe(true)
  })

  it('rejects wrong and incomplete sets', () => {
    expect(multisetEqual('Insert,Lookup', 'Insert,Lookup,Delete')).toBe(false)
    expect(multisetEqual('Insert,Delete', 'Insert,Lookup')).toBe(false)
  })

  it('empty vs empty matches, empty vs non-empty does not', () => {
    expect(multisetEqual('', '')).toBe(true)
    expect(multisetEqual('', 'Insert')).toBe(false)
  })
})

describe('sanitizeTestCases — injection-safe test-case intake', () => {
  it('keeps string input/output pairs, accepts key variants', () => {
    expect(sanitizeTestCases([{ input: '2\n3', output: '5' }])).toEqual([{ input: '2\n3', output: '5' }])
    expect(sanitizeTestCases([{ stdin: 'a', expected_stdout: 'b' }])).toEqual([{ input: 'a', output: 'b' }])
    expect(sanitizeTestCases([{ input: 5, output: true }])).toEqual([{ input: '5', output: 'true' }])
  })

  it('drops operator keys, nested values, and non-objects', () => {
    const out = sanitizeTestCases([
      { input: 'x', output: 'y', $where: 'evil', __proto__: { p: 1 }, nested: { a: 1 }, list: [1] },
      null,
      'string',
      42,
      { input: '', output: '' },
    ])
    expect(out).toEqual([{ input: 'x', output: 'y' }])
    expect(JSON.stringify(out[0])).toBe('{"input":"x","output":"y"}')
  })

  it('caps count and field length', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ input: String(i), output: String(i) }))
    expect(sanitizeTestCases(many)).toHaveLength(10)
    expect(sanitizeTestCases([{ input: 'a'.repeat(5000), output: 'b' }])[0].input).toHaveLength(2000)
  })

  it('returns [] for non-arrays', () => {
    expect(sanitizeTestCases(undefined)).toEqual([])
    expect(sanitizeTestCases({ input: 'x' })).toEqual([])
  })
})

describe('sanitizeExamQuestion — write-path question guard', () => {
  it('keeps known scalars + sanitized cases, drops everything else', () => {
    const q = sanitizeExamQuestion({
      id: 'q1', type: 'coding', title: 'T', prompt: 'P', score: 10,
      answer: 'model', options: ['a'],
      test_cases: [{ input: '1', output: '2' }],
      $set: { admin: true }, constructor: {}, evaluation: 'x'.repeat(30000),
    })
    expect(q).toEqual({
      id: 'q1', type: 'coding', title: 'T', prompt: 'P', score: 10,
      answer: 'model', options: ['a'], test_cases: [{ input: '1', output: '2' }],
    })
  })

  it('returns {} for non-objects', () => {
    expect(sanitizeExamQuestion(null)).toEqual({})
    expect(sanitizeExamQuestion([])).toEqual({})
  })
})