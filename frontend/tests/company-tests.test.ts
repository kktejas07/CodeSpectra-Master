import { describe, expect, it } from 'vitest'
import {
  advanceExpiredSections, apportion, composeSection, difficultyTargets, matchesSection, rotateSection, scoreAttempt,
  scoreSection, seededRand, type BankLite, type TimedSectionState,
} from '@/lib/company-tests/compose'
import {
  DEFAULT_SETTINGS, mergeSettings, patternFromInput, patternInputSchema, remainingUnderCaps, versionSummary,
  type PatternSection,
} from '@/lib/company-tests/types'
import { SEED_PATTERNS } from '@/lib/company-tests/seed-patterns'
import { getCompanyBySlug } from '@/lib/companies/company-catalog'
import { MOCK_TESTS, mockTestHref } from '@/lib/mock-tests'

const section = (over: Partial<PatternSection> = {}): PatternSection => ({
  id: 's1', name: 'Aptitude', questionCount: 10, timeMinutes: 20, questionTypes: ['mcq'], categories: ['quant', 'logical'], ...over,
})

function bank(n: number, difficulty: BankLite['difficulty'], subject: string, type = 'mcq', prefix = subject): BankLite[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${difficulty}-${i}`, type, difficulty, subject }))
}

describe('apportion / difficultyTargets', () => {
  it('always sums to n', () => {
    for (const n of [0, 1, 2, 3, 7, 10, 25, 99]) {
      for (const level of ['easy', 'moderate', 'tough'] as const) {
        const t = difficultyTargets(level, n)
        expect(t.Easy + t.Medium + t.Hard).toBe(n)
      }
    }
  })
  it('maps levels to the bank mix', () => {
    expect(difficultyTargets('easy', 10)).toEqual({ Easy: 10, Medium: 0, Hard: 0 })
    expect(difficultyTargets('moderate', 10)).toEqual({ Easy: 2, Medium: 6, Hard: 2 })
    expect(difficultyTargets('tough', 10)).toEqual({ Easy: 0, Medium: 3, Hard: 7 })
  })
  it('handles zero weights', () => {
    expect(apportion(5, { a: 0, b: 0 })).toEqual({ a: 0, b: 0 })
  })
})

describe('matchesSection', () => {
  it('needs an allowed type and a category word', () => {
    const s = section()
    expect(matchesSection({ id: '1', type: 'mcq', difficulty: 'Easy', subject: 'Quantitative aptitude' }, s)).toBe(true)
    expect(matchesSection({ id: '2', type: 'mcq', difficulty: 'Easy', subject: 'Verbal ability' }, s)).toBe(false)
    expect(matchesSection({ id: '3', type: 'coding', difficulty: 'Easy', subject: 'Quantitative aptitude' }, s)).toBe(false)
    expect(matchesSection({ id: '4', type: 'mcq', difficulty: 'Easy', subject: 'x', tags: ['category:logical'] }, s)).toBe(true)
  })
  it('any code question fits a coding category', () => {
    const s = section({ questionTypes: ['coding'], categories: ['coding'] })
    expect(matchesSection({ id: '1', type: 'coding', difficulty: 'Hard', subject: 'Arrays' }, s)).toBe(true)
  })
  it('respects the branch filter', () => {
    const s = section({ categories: [] })
    expect(matchesSection({ id: '1', type: 'mcq', difficulty: 'Easy', branch: 'mech' }, s, 'cse')).toBe(false)
    expect(matchesSection({ id: '2', type: 'mcq', difficulty: 'Easy' }, s, 'cse')).toBe(true)
  })
})

describe('composeSection (bank first)', () => {
  const pool = [...bank(20, 'Easy', 'quant'), ...bank(20, 'Medium', 'quant'), ...bank(20, 'Hard', 'quant'),
    ...bank(20, 'Easy', 'logical'), ...bank(20, 'Medium', 'logical'), ...bank(20, 'Hard', 'logical')]

  it('fills from the bank with no shortfall when the bank is deep', () => {
    const r = composeSection({ section: section(), level: 'tough', pool, rand: seededRand(1) })
    expect(r.picked).toHaveLength(10)
    expect(new Set(r.picked).size).toBe(10)
    expect(r.generate).toEqual([])
    const hard = r.picked.filter((id) => id.includes('-Hard-')).length
    expect(hard).toBe(7)
  })

  it('spreads picks across categories', () => {
    const r = composeSection({ section: section(), level: 'moderate', pool, rand: seededRand(2) })
    const quant = r.picked.filter((id) => id.startsWith('quant')).length
    expect(quant).toBe(5)
  })

  it('reports the shortfall per difficulty and category for the AI', () => {
    const thin = [...bank(2, 'Hard', 'quant'), ...bank(20, 'Medium', 'quant'), ...bank(20, 'Medium', 'logical')]
    const r = composeSection({ section: section(), level: 'tough', pool: thin, rand: seededRand(3) })
    expect(r.shortfall).toEqual({ Easy: 0, Medium: 0, Hard: 5 })
    const gen = r.generate.filter((g) => g.difficulty === 'Hard')
    expect(gen.reduce((n, g) => n + g.count, 0)).toBe(5)
    // logical had no Hard at all, so it gets most of the generation
    expect(gen.find((g) => g.category === 'logical')!.count).toBeGreaterThan(gen.find((g) => g.category === 'quant')?.count ?? 0)
  })

  it('never reuses excluded questions', () => {
    const exclude = new Set(pool.slice(0, 50).map((q) => q.id))
    const r = composeSection({ section: section(), level: 'easy', pool, exclude, rand: seededRand(4) })
    expect(r.picked.some((id) => exclude.has(id))).toBe(false)
  })
})

describe('rotateSection', () => {
  const s = section({ categories: ['quant'] })
  const pool = [...bank(10, 'Medium', 'quant'), ...bank(10, 'Hard', 'quant')]
  const current = [...pool.slice(0, 5).map((q) => q.id), ...pool.slice(10, 15).map((q) => q.id)]

  it('swaps about the given share, same difficulty, order kept', () => {
    const r = rotateSection({ current, section: s, pool, fraction: 0.3, rand: seededRand(5) })
    expect(r.swapped).toBe(3)
    expect(r.questionIds).toHaveLength(10)
    const changed = r.questionIds.filter((id, i) => id !== current[i])
    expect(changed).toHaveLength(3)
    r.questionIds.forEach((id, i) => {
      if (id !== current[i]) expect(id.split('-')[1]).toBe(current[i].split('-')[1])
    })
    expect(new Set(r.questionIds).size).toBe(10)
  })

  it('keeps a question when no replacement exists', () => {
    const tight = pool.filter((q) => current.includes(q.id))
    const r = rotateSection({ current, section: s, pool: tight, fraction: 0.3, rand: seededRand(6) })
    expect(r.swapped).toBe(0)
    expect(r.questionIds).toEqual(current)
    expect(r.unmet.Medium + r.unmet.Hard).toBeGreaterThan(0)
  })
})

describe('scoring', () => {
  const qs = [
    { id: 'a', type: 'mcq', marks: 1, options: ['1', '2', '3', '4'], answer: '2' },
    { id: 'b', type: 'mcq', marks: 1, options: ['1', '2', '3', '4'], answer: '3' },
    { id: 'c', type: 'mcq', marks: 1, options: ['1', '2', '3', '4'], answer: '4' },
    { id: 'd', type: 'coding', marks: 10 },
    { id: 'e', type: 'descriptive', marks: 10 },
  ]
  it('applies negative marking to wrong objective answers only', () => {
    const r = scoreSection({ id: 's', name: 'S', questions: qs, answers: { a: '2', b: '1', d: 'x' }, cutoffPercent: 50, codeRatios: { d: 0.5 } }, 0.25)
    expect(r.correct).toBe(1)
    expect(r.wrong).toBe(1)
    expect(r.unanswered).toBe(1)
    expect(r.score).toBe(1 - 0.25 + 5)
    expect(r.max).toBe(13) // descriptive not auto-scored
    expect(r.questions.find((q) => q.id === 'e')!.status).toBe('not_scored')
  })
  it('a late section scores nothing', () => {
    const r = scoreSection({ id: 's', name: 'S', questions: qs.slice(0, 3), answers: { a: '2', b: '3', c: '4' }, cutoffPercent: 50, late: true }, 0)
    expect(r.score).toBe(0)
    expect(r.unanswered).toBe(3)
    expect(r.passed).toBe(false)
  })
  it('passes only when overall and every section cut-off are met', () => {
    const s1 = { id: '1', name: 'A', questions: qs.slice(0, 3), answers: { a: '2', b: '3', c: '4' }, cutoffPercent: 60 }
    const s2 = { id: '2', name: 'B', questions: qs.slice(0, 3), answers: { a: '2' }, cutoffPercent: 60 }
    const r = scoreAttempt([s1, s2], 0, 50)
    expect(r.percent).toBeCloseTo(66.67, 1)
    expect(r.sections[1].passed).toBe(false)
    expect(r.passed).toBe(false)
  })
  it('percent never goes below zero', () => {
    const r = scoreSection({ id: 's', name: 'S', questions: qs.slice(0, 3), answers: { a: '1', b: '1', c: '1' }, cutoffPercent: 0 }, 1)
    expect(r.score).toBe(-3)
    expect(r.percent).toBe(0)
  })
})

describe('advanceExpiredSections', () => {
  const mk = (): TimedSectionState[] => [
    { timeMinutes: 10, startedAt: '2026-01-01T10:00:00.000Z', deadline: '2026-01-01T10:10:00.000Z', submittedAt: null, late: false },
    { timeMinutes: 5, startedAt: null, deadline: null, submittedAt: null, late: false },
    { timeMinutes: 5, startedAt: null, deadline: null, submittedAt: null, late: false },
  ]
  it('does nothing inside the time + grace', () => {
    const s = mk()
    expect(advanceExpiredSections(s, 0, new Date('2026-01-01T10:10:20Z'))).toBe(0)
  })
  it('closes expired sections and chains clocks', () => {
    const s = mk()
    expect(advanceExpiredSections(s, 0, new Date('2026-01-01T10:12:00Z'))).toBe(1)
    expect(s[0].late).toBe(true)
    expect(s[1].startedAt).toBe('2026-01-01T10:10:00.000Z')
    expect(s[1].deadline).toBe('2026-01-01T10:15:00.000Z')
  })
  it('finishes the whole run when every clock ran out', () => {
    const s = mk()
    expect(advanceExpiredSections(s, 0, new Date('2026-01-01T12:00:00Z'))).toBe(3)
    expect(s.every((x) => x.late)).toBe(true)
  })
})

describe('patterns, settings and caps', () => {
  it('every seed is valid, unverified and points at a catalog company', () => {
    expect(SEED_PATTERNS.length).toBeGreaterThanOrEqual(17)
    const ids = new Set<string>()
    for (const raw of SEED_PATTERNS) {
      const p = patternFromInput(patternInputSchema.parse(raw), '2026-01-01T00:00:00Z')
      expect(p.verified).toBe(false)
      expect(ids.has(p.id)).toBe(false)
      ids.add(p.id)
      expect(getCompanyBySlug(p.companySlug), p.companySlug).toBeTruthy()
    }
  })
  it('rejects unknown question types and bad links', () => {
    const base = SEED_PATTERNS[0]
    expect(patternInputSchema.safeParse({ ...base, sections: [{ ...base.sections[0], questionTypes: ['banana'] }] }).success).toBe(false)
    expect(patternInputSchema.safeParse({ ...base, sourceUrl: 'javascript:alert(1)' }).success).toBe(false)
  })
  it('settings merge keeps safe defaults and refresh off', () => {
    expect(DEFAULT_SETTINGS.refreshEnabled).toBe(false)
    expect(mergeSettings({ rotatePercent: 500 })).toEqual(DEFAULT_SETTINGS)
    expect(mergeSettings({ refreshEnabled: true }).refreshEnabled).toBe(true)
  })
  it('caps stop generation', () => {
    expect(remainingUnderCaps({ today: 10, monthCostUsd: 1 }, { aiDailyQuestionCap: 40, aiMonthlyCostCapUsd: 5 })).toBe(30)
    expect(remainingUnderCaps({ today: 50, monthCostUsd: 1 }, { aiDailyQuestionCap: 40, aiMonthlyCostCapUsd: 5 })).toBe(0)
    expect(remainingUnderCaps({ today: 0, monthCostUsd: 5 }, { aiDailyQuestionCap: 40, aiMonthlyCostCapUsd: 5 })).toBe(0)
  })
  it('version summary counts pending drafts separately', () => {
    const p = { sections: [section({ questionCount: 10 })] }
    expect(versionSummary(p, 'easy', null)).toMatchObject({ built: false, missing: 10 })
    const v = { id: 'x:easy', patternId: 'x', companySlug: 'x', level: 'easy' as const, complete: false, builtAt: 't', revision: 1,
      sections: [{ sectionId: 's1', name: 'A', timeMinutes: 20, questionIds: ['1', '2', '3'], pendingDraftIds: ['4', '5'], missing: 5 }] }
    expect(versionSummary(p, 'easy', v)).toMatchObject({ built: true, questions: 3, pending: 2, missing: 5 })
  })
})

describe('mock test catalogue', () => {
  it('pattern entries open the practice runner, others the AI mock', () => {
    const tcs = MOCK_TESTS.find((t) => t.id === 'tcs-software-engineer')!
    expect(mockTestHref(tcs)).toBe('/dashboard/company-tests/tcs-nqt')
    const ey = MOCK_TESTS.find((t) => t.id === 'ey-data-analyst')!
    expect(mockTestHref(ey)).toMatch(/^\/dashboard\/mock-tests\/ey-data-analyst\?/)
    const seedIds = new Set(SEED_PATTERNS.map((p) => p.id))
    for (const t of MOCK_TESTS) if (t.pattern) expect(seedIds.has(t.pattern), t.pattern).toBe(true)
  })
})
