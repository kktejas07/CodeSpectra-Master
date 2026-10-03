/**
 * Jev grade-verification decision tests (lib/ai/jev.ts — pure logic).
 * Run: npx vitest run tests/jev-agree.test.ts
 */
import { describe, it, expect } from 'vitest'
import { jevAgrees } from '@/lib/ai/jev'

const MAX = 10

describe('jevAgrees — verifies the grade, not the answer', () => {
  it('agrees on a correctly-scored WRONG answer (0 points)', () => {
    // Answer shows no concept AND scored 0 → aligned, grade is right.
    expect(jevAgrees({ conceptProb: 0.05, scoreProb: 0.95, awarded: 0, maxPoints: MAX })).toBe(true)
  })

  it('agrees on a correctly-scored GOOD answer (full points)', () => {
    expect(jevAgrees({ conceptProb: 0.9, scoreProb: 0.9, awarded: 10, maxPoints: MAX })).toBe(true)
  })

  it('flags a concept-correct answer that scored low (under-grade)', () => {
    expect(jevAgrees({ conceptProb: 0.9, scoreProb: 0.9, awarded: 0, maxPoints: MAX })).toBe(false)
  })

  it('flags a wrong answer that scored high (over-grade)', () => {
    expect(jevAgrees({ conceptProb: 0.1, scoreProb: 0.9, awarded: 10, maxPoints: MAX })).toBe(false)
  })

  it('flags when the model itself says the score does not fit', () => {
    expect(jevAgrees({ conceptProb: 0.9, scoreProb: 0.1, awarded: 10, maxPoints: MAX })).toBe(false)
  })

  it('treats the 50% boundary as high award', () => {
    expect(jevAgrees({ conceptProb: 0.8, scoreProb: 0.8, awarded: 5, maxPoints: MAX })).toBe(true)
  })

  it('handles zero maxPoints without flagging on alignment alone', () => {
    // maxPoints 0 → highAward false; a good answer then misaligns → false.
    expect(jevAgrees({ conceptProb: 0.9, scoreProb: 0.9, awarded: 0, maxPoints: 0 })).toBe(false)
    expect(jevAgrees({ conceptProb: 0.1, scoreProb: 0.9, awarded: 0, maxPoints: 0 })).toBe(true)
  })
})
