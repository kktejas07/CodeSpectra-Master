import { describe, it, expect } from 'vitest'
import {
  SCREENING_CRITERIA,
  DEFAULT_WEIGHTS,
  clampScore,
  normalizeScores,
  scoreTotals,
  blendScores,
} from '@/lib/hackathons/ai-screening'

describe('SCREENING_CRITERIA / DEFAULT_WEIGHTS', () => {
  it('has 6 criteria with unique keys', () => {
    expect(SCREENING_CRITERIA).toHaveLength(6)
    const keys = SCREENING_CRITERIA.map((c) => c.key)
    expect(new Set(keys).size).toBe(6)
  })

  it('weights cover every criterion and default to 1', () => {
    for (const c of SCREENING_CRITERIA) {
      expect(DEFAULT_WEIGHTS[c.key]).toBe(1)
    }
  })

  it('max total is 30 with default weights', () => {
    const full = SCREENING_CRITERIA.map((c) => ({ key: c.key, score: 5, citation: 'x' }))
    expect(scoreTotals(full)).toEqual({ total: 30, maxTotal: 30 })
  })
})

describe('clampScore', () => {
  it('clamps out-of-range values to 1–5', () => {
    expect(clampScore(0)).toBe(1)
    expect(clampScore(-3)).toBe(1)
    expect(clampScore(6)).toBe(5)
    expect(clampScore(99)).toBe(5)
  })

  it('rounds to integers', () => {
    expect(clampScore(3.7)).toBe(4)
    expect(clampScore(2.2)).toBe(2)
  })

  it('defaults non-numbers to 2', () => {
    expect(clampScore(null)).toBe(2)
    expect(clampScore(undefined)).toBe(2)
    expect(clampScore('4')).toBe(2)
    expect(clampScore(NaN)).toBe(2)
    expect(clampScore(Infinity)).toBe(2)
  })
})

describe('normalizeScores', () => {
  it('drops scores with empty citations to 2 with missing set', () => {
    const out = normalizeScores([{ key: 'relevance', score: 5, citation: '  ' }])
    const rel = out.find((s) => s.key === 'relevance')!
    expect(rel.score).toBe(2)
    expect(rel.missing).toBe('no evidence cited')
  })

  it('keeps well-cited scores clamped to 1–5', () => {
    const out = normalizeScores([
      { key: 'innovation', score: 9, citation: 'package.json + 40 commits' },
      { key: 'ux', score: 0, citation: 'live URL renders' },
    ])
    expect(out.find((s) => s.key === 'innovation')!.score).toBe(5)
    expect(out.find((s) => s.key === 'ux')!.score).toBe(1)
  })

  it('fills criteria the model omitted', () => {
    const out = normalizeScores([])
    expect(out).toHaveLength(6)
    for (const s of out) {
      expect(s.score).toBe(2)
      expect(s.missing).toBe('no evidence cited')
    }
  })

  it('ignores unknown keys and non-array input', () => {
    const out = normalizeScores({ scores: [] })
    expect(out).toHaveLength(6)
    const out2 = normalizeScores([{ key: 'bogus', score: 5, citation: 'x' }])
    expect(out2.find((s) => s.key === 'bogus')).toBeUndefined()
  })
})

describe('scoreTotals weights math', () => {
  it('applies custom weights to total and max', () => {
    const scores = [
      { key: 'relevance', score: 4, citation: 'x' },
      { key: 'innovation', score: 2, citation: 'y' },
    ]
    expect(scoreTotals(scores, { relevance: 2, innovation: 3 })).toEqual({
      total: 4 * 2 + 2 * 3,
      maxTotal: 5 * 2 + 5 * 3,
    })
  })

  it('falls back to weight 1 for unknown keys', () => {
    expect(scoreTotals([{ key: 'nope', score: 3, citation: 'x' }], {})).toEqual({
      total: 3,
      maxTotal: 5,
    })
  })
})

describe('blendScores', () => {
  it('returns null when no human scores exist yet', () => {
    expect(blendScores(21, null)).toBeNull()
    expect(blendScores(21, undefined)).toBeNull()
    expect(blendScores(21, NaN)).toBeNull()
  })

  it('blends with default aiWeight 0.4', () => {
    // 21 * 0.4 + 80 * 0.6 = 8.4 + 48 = 56.4
    expect(blendScores(21, 80)).toBe(56.4)
  })

  it('respects a custom aiWeight', () => {
    // 20 * 0.5 + 60 * 0.5 = 40
    expect(blendScores(20, 60, 0.5)).toBe(40)
  })
})
