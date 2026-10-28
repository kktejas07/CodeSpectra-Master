/**
 * Question-type registry + structured graders (lib/question-types.ts,
 * lib/grading.ts). Run: npx vitest run tests/question-types.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  canonicalType,
  isCodingType,
  isDeterministicType,
  isScoredType,
  resolveQuestionType,
  QUESTION_TYPE_META,
  BANK_QUESTION_TYPES,
} from '@/lib/question-types'
import { compareObjectiveAnswer, sanitizeExamQuestion } from '@/lib/grading'

describe('question-type registry', () => {
  it('resolves legacy spellings to canonical ids', () => {
    expect(canonicalType('multiple-choice')).toBe('mcq')
    expect(canonicalType('Multiple Response')).toBe('multiple_response')
    expect(canonicalType('Yes/No')).toBe('yes_no')
    expect(canonicalType('fillinthe blanks')).toBe('fill_blanks')
    expect(canonicalType('debug')).toBe('debugging')
    expect(canonicalType('predict the output')).toBe('output_prediction')
    expect(canonicalType('Multiple True-False')).toBe('matrix')
    expect(canonicalType('case study')).toBe('case_study')
  })

  it('falls back for unknown values', () => {
    expect(resolveQuestionType('not-a-type')).toBeNull()
    expect(canonicalType('not-a-type')).toBe('mcq')
    expect(canonicalType('not-a-type', 'descriptive')).toBe('descriptive')
  })

  it('classifies groups and scoring', () => {
    expect(isDeterministicType('matching')).toBe(true)
    expect(isDeterministicType('numeric')).toBe(true)
    expect(isDeterministicType('debugging')).toBe(false)
    expect(isCodingType('sql')).toBe(true)
    expect(isCodingType('mcq')).toBe(false)
    expect(isScoredType('likert')).toBe(false)
    expect(isScoredType('mcq')).toBe(true)
  })

  it('every registry type has full metadata and is listed', () => {
    for (const t of BANK_QUESTION_TYPES) {
      expect(QUESTION_TYPE_META[t]?.label).toBeTruthy()
      expect(canonicalType(t)).toBe(t)
    }
  })
})

describe('compareObjectiveAnswer — new objective kinds', () => {
  it('numeric honours tolerance', () => {
    expect(compareObjectiveAnswer({ type: 'numeric', answer: '14', tolerance: 0.5 }, '14.4').correct).toBe(true)
    expect(compareObjectiveAnswer({ type: 'numeric', answer: '14', tolerance: 0.5 }, '15').correct).toBe(false)
    expect(compareObjectiveAnswer({ type: 'numeric', answer: '14' }, '14.0').correct).toBe(true)
  })

  it('yes_no / short_answer behave like normalized text', () => {
    expect(compareObjectiveAnswer({ type: 'yes_no', answer: 'Yes', options: ['Yes', 'No'] }, 'yes').correct).toBe(true)
    expect(compareObjectiveAnswer({ type: 'short_answer', answer: 'Binary Search' }, 'binary  search').correct).toBe(true)
  })

  it('ordering / ranking require exact order', () => {
    const q = { type: 'ordering', answer: 'A, B, C', options: ['A', 'B', 'C'] }
    expect(compareObjectiveAnswer(q, 'a,b,c').correct).toBe(true)
    expect(compareObjectiveAnswer(q, 'A,C,B').correct).toBe(false)
  })

  it('matching grades pair maps with partial credit', () => {
    const pairs = [{ left: 'A', right: '1' }, { left: 'B', right: '2' }]
    const all = compareObjectiveAnswer({ type: 'matching', pairs }, JSON.stringify({ A: '1', B: '2' }))
    expect(all).toEqual({ correct: true, ratio: 1 })
    const half = compareObjectiveAnswer({ type: 'matching', pairs }, JSON.stringify({ A: '1', B: 'x' }))
    expect(half.ratio).toBe(0.5)
    expect(half.correct).toBe(false)
  })

  it('matrix and table_fill compare per-row cells', () => {
    const matrix = { rows: ['r1', 'r2'], columns: ['T', 'F'] }
    expect(compareObjectiveAnswer({ type: 'matrix', matrix, answer: 'T, F' }, 'T,F').correct).toBe(true)
    expect(compareObjectiveAnswer({ type: 'matrix', matrix, answer: 'T, F' }, 'T,T').correct).toBe(false)
    const table = { columns: ['x'], rows: ['r1', 'r2'] }
    expect(compareObjectiveAnswer({ type: 'table_fill', table, answer: 'a, b' }, 'a,b').correct).toBe(true)
  })

  it('fill_blanks stays order-insensitive with partial credit', () => {
    const q = { type: 'fill_blanks', answer: 'testing, documentation' }
    expect(compareObjectiveAnswer(q, 'documentation, testing').correct).toBe(true)
    expect(compareObjectiveAnswer(q, 'testing').ratio).toBeCloseTo(0.5)
  })
})

describe('sanitizeExamQuestion — structured fields', () => {
  it('keeps known structured fields and drops operator keys', () => {
    const q = sanitizeExamQuestion({
      id: 'q1', type: 'hotspot', title: 'T', prompt: 'P', score: 5,
      answer: 'r2',
      image_url: 'https://x/y.png',
      regions: [
        { id: 'r1', x: 0, y: 0, w: 10, h: 10, label: 'a', $evil: 1 },
        { id: 'r2', x: 10, y: 10, w: 5, h: 5 },
      ],
      tolerance: 2,
      pairs: [{ left: 'a', right: 'b' }, { left: '', right: 'x' }],
      matrix: { rows: ['r1'], columns: ['T', 'F'], $set: { x: 1 } },
      language: 'python',
      starter_code: 'print(1)',
      $where: 'evil',
    })
    expect(q.image_url).toBe('https://x/y.png')
    expect(q.regions).toEqual([
      { id: 'r1', x: 0, y: 0, w: 10, h: 10, label: 'a' },
      { id: 'r2', x: 10, y: 10, w: 5, h: 5 },
    ])
    expect(q.tolerance).toBe(2)
    expect(q.pairs).toEqual([{ left: 'a', right: 'b' }])
    expect(q.matrix).toEqual({ rows: ['r1'], columns: ['T', 'F'] })
    expect(q.language).toBe('python')
    expect(q.starter_code).toBe('print(1)')
    expect(q.$where).toBeUndefined()
  })

  it('drops malformed structured values', () => {
    const q = sanitizeExamQuestion({ id: 'q1', type: 'matching', tolerance: -5, pairs: [null, { left: 'a' }] })
    expect(q.tolerance).toBeUndefined()
    expect(q.pairs).toBeUndefined()
  })
})
