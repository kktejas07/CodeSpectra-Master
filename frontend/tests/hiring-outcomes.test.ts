import { describe, expect, it } from 'vitest'
import {
  bandFor,
  buildValidityReport,
  correlate,
  MIN_SAMPLE,
  parseOutcomeUpdate,
  pearson,
  performanceOf,
  type ValidityRow,
} from '@/lib/hiring-outcomes'

describe('pearson', () => {
  it('perfect positive / negative / known value', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 10)
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 10)
    // x = 1..5, y = [2,4,5,4,5] → r = 0.7746
    expect(pearson([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])).toBeCloseTo(0.7746, 4)
  })
  it('null when there is no variance or too few points', () => {
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull()
    expect(pearson([1], [1])).toBeNull()
  })
  it('with a 0/1 outcome it is the point-biserial r', () => {
    // scores of hired (1) vs rejected (0)
    const xs = [90, 80, 70, 40, 30, 20]
    const ys = [1, 1, 1, 0, 0, 0]
    const m1 = 80, m0 = 30, p = 0.5
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length
    const sd = Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length)
    expect(pearson(xs, ys)).toBeCloseTo(((m1 - m0) / sd) * Math.sqrt(p * (1 - p)), 10)
  })
})

describe('correlate: sample size warning', () => {
  const pairs = (n: number): Array<[number, number]> => Array.from({ length: n }, (_, i) => [i, i % 2])
  it('below the minimum sample: not enough data, no r reported', () => {
    const r = correlate(pairs(MIN_SAMPLE - 1))
    expect(r).toEqual({ n: MIN_SAMPLE - 1, r: null, enough: false })
  })
  it('at the minimum sample: r is reported, rounded to 3 places', () => {
    const r = correlate(pairs(MIN_SAMPLE))
    expect(r.enough).toBe(true)
    expect(typeof r.r).toBe('number')
    expect(Number(r.r!.toFixed(3))).toBe(r.r)
  })
})

describe('score bands', () => {
  it('maps edges correctly', () => {
    expect(bandFor(0).id).toBe('0-39')
    expect(bandFor(39.4).id).toBe('0-39')
    expect(bandFor(39.6).id).toBe('40-59')
    expect(bandFor(59).id).toBe('40-59')
    expect(bandFor(60).id).toBe('60-79')
    expect(bandFor(80).id).toBe('80-100')
    expect(bandFor(100).id).toBe('80-100')
    expect(bandFor(140).id).toBe('80-100')
  })
})

describe('performanceOf', () => {
  it('averages the valid period ratings', () => {
    expect(performanceOf({ d30: { value: 4 }, d90: { value: 2 } })).toBe(3)
    expect(performanceOf({ d30: { value: 9 } })).toBeNull()
    expect(performanceOf(null)).toBeNull()
  })
})

describe('buildValidityReport', () => {
  const rows: ValidityRow[] = [
    { score: 90, status: 'hired', performance: 5, sections: { a: 95 } },
    { score: 85, status: 'hired', performance: 4, sections: { a: 80 } },
    { score: 82, status: 'rejected', performance: null, sections: { a: 70 } },
    { score: 65, status: 'hired', performance: 3, sections: { a: 60 } },
    { score: 50, status: 'rejected', performance: null, sections: { a: 40 } },
    { score: 45, status: 'withdrew', performance: null, sections: { a: 50 } },
    { score: 30, status: 'rejected', performance: null, sections: { a: 20 } },
    { score: 20, status: 'shortlisted', performance: null, sections: { a: null } },
  ]

  it('counts statuses and bands; hire rate uses hired + rejected only', () => {
    const r = buildValidityReport(rows, [{ id: 'a', title: 'A' }])
    expect(r.total).toBe(8)
    expect(r.counts).toMatchObject({ hired: 3, rejected: 3, withdrew: 1, shortlisted: 1, offered: 0, interviewed: 0 })
    const top = r.bands.find((b) => b.id === '80-100')!
    expect(top).toMatchObject({ candidates: 3, decided: 3, hired: 2, hireRate: 0.67, rated: 2, avgPerformance: 4.5 })
    const mid = r.bands.find((b) => b.id === '40-59')!
    expect(mid).toMatchObject({ candidates: 2, decided: 1, hired: 0, hireRate: 0 })
    const low = r.bands.find((b) => b.id === '0-39')!
    expect(low).toMatchObject({ candidates: 2, decided: 1, hireRate: 0, avgPerformance: null })
  })

  it('small samples: correlations flagged as not enough data', () => {
    const r = buildValidityReport(rows, [{ id: 'a', title: 'A' }])
    expect(r.hire).toEqual({ n: 6, r: null, enough: false })
    expect(r.performance).toEqual({ n: 3, r: null, enough: false })
    expect(r.sections[0].hire.n).toBe(6)
  })

  it('with a low minimum the same data gives the expected r values', () => {
    const r = buildValidityReport(rows, [{ id: 'a', title: 'A' }], 3)
    // hire pairs: scores [90,85,82,65,50,30] vs [1,1,0,1,0,0]
    expect(r.hire.r).toBeCloseTo(pearson([90, 85, 82, 65, 50, 30], [1, 1, 0, 1, 0, 0])!, 3)
    // performance pairs: [90,85,65] vs [5,4,3]
    expect(r.performance.r).toBeCloseTo(pearson([90, 85, 65], [5, 4, 3])!, 3)
    // section "a": [95,80,70,60,40,20] vs hire
    expect(r.sections[0].hire.r).toBeCloseTo(pearson([95, 80, 70, 60, 40, 20], [1, 1, 0, 1, 0, 0])!, 3)
  })

  it('empty input is an honest empty report', () => {
    const r = buildValidityReport([])
    expect(r.total).toBe(0)
    expect(r.hire.enough).toBe(false)
    expect(r.bands.every((b) => b.candidates === 0 && b.hireRate === null)).toBe(true)
  })
})

describe('parseOutcomeUpdate', () => {
  it('accepts a status or a rating and whitelists fields', () => {
    const r = parseOutcomeUpdate({ exam_id: 'e1', user_ids: ['u1', 'u1', 'u2', 5], status: 'hired', tenant_id: 'evil' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual({ exam_id: 'e1', user_ids: ['u1', 'u2'], status: 'hired', rating: null })
  })
  it('rejects bad input', () => {
    expect(parseOutcomeUpdate({ exam_id: 'e1', user_ids: ['u1'], status: 'promoted' }).ok).toBe(false)
    expect(parseOutcomeUpdate({ exam_id: 'e1', user_ids: ['u1'], rating: { period: 60, value: 3 } }).ok).toBe(false)
    expect(parseOutcomeUpdate({ exam_id: 'e1', user_ids: ['u1'], rating: { period: 30, value: 6 } }).ok).toBe(false)
    expect(parseOutcomeUpdate({ exam_id: 'e1', user_ids: [] , status: 'hired' }).ok).toBe(false)
    expect(parseOutcomeUpdate({ exam_id: 'e1', user_ids: ['u1'] }).ok).toBe(false)
    expect(parseOutcomeUpdate({ user_ids: ['u1'], status: 'hired' }).ok).toBe(false)
  })
})
