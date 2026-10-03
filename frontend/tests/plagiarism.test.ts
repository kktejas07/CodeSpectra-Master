/**
 * Plagiarism detector pure-logic tests (no Mongo, no LLM).
 * Run: npx vitest run tests/plagiarism.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  normalizeQuestionText,
  buildBankAnswerMap,
  bankAnswerFor,
  computeSimilarity,
} from '@/lib/proctoring/plagiarism-detector'

describe('normalizeQuestionText', () => {
  it('collapses whitespace and lowercases', () => {
    expect(normalizeQuestionText('  What   IS\n2+2? ')).toBe('what is 2+2?')
    expect(normalizeQuestionText(null)).toBe('')
  })
})

describe('buildBankAnswerMap — real BankQuestionDoc shape', () => {
  const bank = [
    { id: 'b1', title: 'Sum', question: 'Write  a function\nthat adds two numbers', answer: 'def add(a,b): return a+b' },
    { id: 'b2', title: 'Capital', question: 'Capital of France?', answer: 'Paris' },
    { id: 'b3', title: 'No answer', question: 'Unanswerable?' },
    null,
    'junk',
  ]

  it('indexes by normalized question text, title, and id', () => {
    const map = buildBankAnswerMap(bank as any)
    expect(map.get('write a function that adds two numbers')).toBe('def add(a,b): return a+b')
    expect(map.get('capital')).toBe('paris')
    expect(map.get('id:b1')).toBe('def add(a,b): return a+b')
  })

  it('skips docs without answers and non-objects', () => {
    const map = buildBankAnswerMap(bank as any)
    expect(map.has('unanswerable?')).toBe(false)
    // b1 + b2 × (question text + title + id) = 6 keys.
    expect(map.size).toBe(6)
  })

  it('never carries legacy question_id/question_text keys', () => {
    const legacy = [{ question_id: 'q1', question_text: 'What?', answer: 'x' }]
    const map = buildBankAnswerMap(legacy as any)
    // Legacy shape has no id/title/question fields → nothing indexed.
    expect(map.size).toBe(0)
  })
})

describe('bankAnswerFor', () => {
  const map = buildBankAnswerMap([
    { id: 'b1', title: 'Sum', question: 'Add two numbers', answer: 'a+b' },
  ] as any)

  it('matches exam prompt text despite formatting', () => {
    expect(
      bankAnswerFor(map, { id: 'random-uuid', prompt: '  ADD   two\nnumbers ' })
    ).toBe('a+b')
  })

  it('falls back to title, then id', () => {
    expect(bankAnswerFor(map, { id: 'x', title: 'sum' })).toBe('a+b')
    expect(bankAnswerFor(map, { id: 'b1', title: 'zzz', prompt: 'zzz' })).toBe('a+b')
  })

  it('returns null on miss', () => {
    expect(bankAnswerFor(map, { id: 'zzz', prompt: 'unrelated question here' })).toBeNull()
  })
})

describe('computeSimilarity', () => {
  it('is 1 for identical strings', () => {
    expect(computeSimilarity('def solve(): return 42', 'def solve(): return 42')).toBe(1)
  })

  it('is 0 for empty or disjoint inputs', () => {
    expect(computeSimilarity('', 'x')).toBe(0)
    expect(computeSimilarity('abc', 'xyzzy')).toBeLessThan(0.2)
  })

  it('rates near-duplicates high', () => {
    expect(computeSimilarity('the quick brown fox jumps', 'the quick brown fox jumped')).toBeGreaterThan(0.8)
  })
})
