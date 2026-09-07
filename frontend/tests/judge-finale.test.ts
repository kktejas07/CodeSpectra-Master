import { describe, it, expect } from 'vitest'
import {
  DEFAULT_JUDGING_CONFIG,
  JUDGING_CRITERION_KEYS,
  sanitizeJudgingConfig,
  judgingWeights,
} from '@/lib/hackathons/judge-config'
import {
  collectHumanScores,
  judgeStats,
  normalizeScores,
  dropHighLow,
  average,
  blendFinal,
} from '@/lib/hackathons/calibration'
import { buildProjectReport } from '@/lib/hackathons/reporting'

// ── Config defaults / validation ────────────────────────────────────────────

describe('DEFAULT_JUDGING_CONFIG', () => {
  it('has the 6 screening criteria at weight 1', () => {
    expect(DEFAULT_JUDGING_CONFIG.criteria).toHaveLength(6)
    expect(JUDGING_CRITERION_KEYS).toHaveLength(6)
    for (const c of DEFAULT_JUDGING_CONFIG.criteria) {
      expect(c.weight).toBe(1)
      expect(JUDGING_CRITERION_KEYS).toContain(c.key)
    }
  })

  it('defaults aiWeight 0.4, topN 10, display 3, flags off', () => {
    expect(DEFAULT_JUDGING_CONFIG.aiWeight).toBe(0.4)
    expect(DEFAULT_JUDGING_CONFIG.advanceTopN).toBe(10)
    expect(DEFAULT_JUDGING_CONFIG.displayCount).toBe(3)
    expect(DEFAULT_JUDGING_CONFIG.blindMode).toBe(false)
    expect(DEFAULT_JUDGING_CONFIG.dropHighLow).toBe(false)
  })
})

describe('sanitizeJudgingConfig', () => {
  it('returns defaults for null/garbage', () => {
    expect(sanitizeJudgingConfig(null)).toEqual(DEFAULT_JUDGING_CONFIG)
    expect(sanitizeJudgingConfig('nope')).toEqual(DEFAULT_JUDGING_CONFIG)
    expect(sanitizeJudgingConfig(undefined)).toEqual(DEFAULT_JUDGING_CONFIG)
  })

  it('clamps aiWeight to 0–1', () => {
    expect(sanitizeJudgingConfig({ aiWeight: 2 }).aiWeight).toBe(1)
    expect(sanitizeJudgingConfig({ aiWeight: -1 }).aiWeight).toBe(0)
    expect(sanitizeJudgingConfig({ aiWeight: 'x' }).aiWeight).toBe(0.4)
  })

  it('drops unknown + duplicate criteria, clamps weights', () => {
    const out = sanitizeJudgingConfig({
      criteria: [
        { key: 'implementation', weight: 3 },
        { key: 'implementation', weight: 9 },
        { key: 'bogus', weight: 5 },
        { key: 'ux', weight: -2 },
        null,
      ],
    })
    expect(out.criteria.map((c) => c.key)).toEqual(['implementation', 'ux'])
    expect(out.criteria[0].weight).toBe(3)
    expect(out.criteria[1].weight).toBe(0)
  })

  it('falls back to all-6 when criteria empty', () => {
    expect(sanitizeJudgingConfig({ criteria: [] }).criteria).toHaveLength(6)
  })

  it('coerces topN/display to ints ≥1 and booleans strictly', () => {
    const out = sanitizeJudgingConfig({ advanceTopN: 2.7, displayCount: 0, blindMode: 1 as unknown as boolean, dropHighLow: 'yes' as unknown as boolean })
    expect(out.advanceTopN).toBe(3)
    expect(out.displayCount).toBe(1)
    expect(out.blindMode).toBe(false)
    expect(out.dropHighLow).toBe(false)
  })

  it('never throws on hostile input', () => {
    expect(() => sanitizeJudgingConfig({ criteria: [{ key: 42, weight: NaN }] })).not.toThrow()
  })
})

describe('judgingWeights', () => {
  it('maps every key with fallback 1', () => {
    const w = judgingWeights({ ...DEFAULT_JUDGING_CONFIG, criteria: [{ key: 'implementation', label: 'x', weight: 2 }] })
    expect(w.implementation).toBe(2)
    expect(w.ux).toBe(1)
    for (const k of JUDGING_CRITERION_KEYS) expect(w[k]).toBeDefined()
  })
})

// ── Calibration ─────────────────────────────────────────────────────────────

function sub(id: string, entries: Array<{ judge_id: string; score?: number; total_score?: number }>, rubric = false) {
  return {
    id,
    ...(rubric
      ? { rubric_scores: entries.map((e) => ({ judge_id: e.judge_id, total_score: e.total_score ?? 0, criteria: [], feedback: '', created_at: '' })) }
      : { scores: entries.map((e) => ({ judge_id: e.judge_id, score: e.score ?? 0, feedback: '', created_at: '' })) }),
  }
}

describe('collectHumanScores', () => {
  it('reads scores[] and rubric_scores[] and skips garbage', () => {
    const out = collectHumanScores([
      sub('s1', [{ judge_id: 'j1', score: 80 }, { judge_id: '', score: 10 }, { judge_id: 'j2', score: NaN }]),
      sub('s2', [{ judge_id: 'j1', total_score: 90 }], true),
      null,
      { id: '' },
    ])
    expect(out).toEqual([
      { judgeId: 'j1', submissionId: 's1', total: 80 },
      { judgeId: 'j1', submissionId: 's2', total: 90 },
    ])
  })

  it('returns [] for non-arrays', () => {
    expect(collectHumanScores(null)).toEqual([])
    expect(collectHumanScores({})).toEqual([])
  })
})

describe('judgeStats', () => {
  it('flags the harsh outlier (|z| > 1.5)', () => {
    // Three generous judges at 100, one harsh at 0 → harsh mean is >1.5σ out.
    const scores = [
      { judgeId: 'g1', submissionId: 's', total: 100 },
      { judgeId: 'g2', submissionId: 's', total: 100 },
      { judgeId: 'g3', submissionId: 's', total: 100 },
      { judgeId: 'harsh', submissionId: 's', total: 0 },
    ]
    const stats = judgeStats(scores)
    const harsh = stats.find((s) => s.judgeId === 'harsh')!
    expect(harsh.outlier).toBe(true)
    expect(Math.abs(harsh.z)).toBeGreaterThan(1.5)
    for (const g of ['g1', 'g2', 'g3']) {
      expect(stats.find((s) => s.judgeId === g)!.outlier).toBe(false)
    }
  })

  it('flags nobody when judges agree', () => {
    const scores = [
      { judgeId: 'a', submissionId: 's', total: 70 },
      { judgeId: 'b', submissionId: 's', total: 78 },
      { judgeId: 'c', submissionId: 's', total: 82 },
      { judgeId: 'd', submissionId: 's', total: 90 },
    ]
    expect(judgeStats(scores).every((s) => !s.outlier)).toBe(true)
  })

  it('flags nothing with a single judge', () => {
    const stats = judgeStats([{ judgeId: 'solo', submissionId: 's', total: 70 }])
    expect(stats).toHaveLength(1)
    expect(stats[0].outlier).toBe(false)
    expect(stats[0].z).toBe(0)
  })

  it('reports mean/std/count', () => {
    const stats = judgeStats([
      { judgeId: 'j', submissionId: 'a', total: 80 },
      { judgeId: 'j', submissionId: 'b', total: 100 },
    ])
    expect(stats[0]).toMatchObject({ judgeId: 'j', mean: 90, std: 10, count: 2 })
  })
})

describe('normalizeScores', () => {
  it('returns copies unchanged with <2 judges', () => {
    const inList = [{ judgeId: 'solo', submissionId: 's', total: 70 }]
    const out = normalizeScores(inList)
    expect(out).toEqual(inList)
    expect(out[0]).not.toBe(inList[0])
  })

  it('pulls a strict judge up toward the panel mean', () => {
    const scores = [
      { judgeId: 'lenient', submissionId: 'a', total: 80 },
      { judgeId: 'lenient', submissionId: 'b', total: 90 },
      { judgeId: 'strict', submissionId: 'a', total: 50 },
      { judgeId: 'strict', submissionId: 'b', total: 60 },
    ]
    const out = normalizeScores(scores)
    const strictB = out.find((s) => s.judgeId === 'strict' && s.submissionId === 'b')!
    // strict mean 55, std 5 → z=1; panel mean 70, std ~15.8 → ≈85.8
    expect(strictB.total).toBeCloseTo(85.8, 1)
    expect(strictB.total).toBeGreaterThan(60)
  })

  it('collapses to panel mean when a judge has no spread', () => {
    const scores = [
      { judgeId: 'flat', submissionId: 'a', total: 70 },
      { judgeId: 'flat', submissionId: 'b', total: 70 },
      { judgeId: 'varied', submissionId: 'a', total: 60 },
      { judgeId: 'varied', submissionId: 'b', total: 80 },
    ]
    const out = normalizeScores(scores)
    // panel mean = 70 → flat judge's scores stay 70
    expect(out.filter((s) => s.judgeId === 'flat').map((s) => s.total)).toEqual([70, 70])
  })
})

describe('dropHighLow / average', () => {
  it('drops one high + one low', () => {
    expect(dropHighLow([10, 20, 30, 90])).toEqual([20, 30])
  })

  it('keeps copies when <3 values', () => {
    expect(dropHighLow([50, 90])).toEqual([50, 90])
    expect(dropHighLow([])).toEqual([])
  })

  it('average trims when asked, null when empty', () => {
    expect(average([10, 20, 30, 90], { dropHighLow: true })).toBe(25)
    expect(average([10, 20, 30, 90])).toBe(37.5)
    expect(average([])).toBeNull()
    expect(average([80])).toBe(80)
  })
})

describe('blendFinal', () => {
  it('blends with aiWeight, defaults 0.4', () => {
    expect(blendFinal(30, 70)).toBe(54) // 30*.4 + 70*.6
    expect(blendFinal(30, 70, 1)).toBe(30)
    expect(blendFinal(30, 70, 0)).toBe(70)
  })

  it('falls back to whichever side exists', () => {
    expect(blendFinal(30, null)).toBe(30)
    expect(blendFinal(null, 70)).toBe(70)
    expect(blendFinal(null, null)).toBeNull()
  })
})

// ── Reports ─────────────────────────────────────────────────────────────────

const base = {
  submissionId: 's1',
  teamName: 'Alpha',
  problemSlug: 'build-x',
  winnerId: 's2',
  winnerTeamName: 'Beta',
  rank: 2,
  totalTeams: 5,
}

function screeningOf(pairs: Array<[string, number]>) {
  return {
    scores: pairs.map(([key, score]) => ({ key, score, citation: 'evidence' })),
    total: 20,
    maxTotal: 30,
    notes: 'solid',
  }
}

describe('buildProjectReport', () => {
  it('picks the max criterion as strongestDimension', () => {
    const r = buildProjectReport({
      ...base,
      screening: screeningOf([['relevance', 3], ['implementation', 5], ['ux', 4]]),
      humanAvg: 80,
      humanCount: 2,
      finalScore: 60,
      evidence: null,
      winnerScores: [{ key: 'relevance', score: 4 }, { key: 'implementation', score: 4 }, { key: 'ux', score: 4 }],
    })
    expect(r.strongestDimension).toBe('Implementation quality')
    expect(r.scoreBreakdown).toHaveLength(3)
    expect(r.sections.map((s) => s.title)).toEqual(
      expect.arrayContaining(['Overview', 'Score breakdown', 'Evidence highlights', 'What decided it']),
    )
  })

  it('names the concrete criterion gap vs the winner with deltas', () => {
    const r = buildProjectReport({
      ...base,
      screening: screeningOf([['relevance', 4], ['implementation', 2], ['ux', 3]]),
      humanAvg: null,
      finalScore: 20,
      evidence: null,
      winnerScores: [{ key: 'relevance', score: 4 }, { key: 'implementation', score: 5 }, { key: 'ux', score: 3 }],
    })
    // implementation delta 3 is the largest gap
    expect(r.decisiveGap).toContain('Implementation quality')
    expect(r.decisiveGap).toContain('2/5')
    expect(r.decisiveGap).toContain('5/5')
  })

  it('reports no gap for the winner itself', () => {
    const r = buildProjectReport({
      ...base,
      submissionId: 's2',
      winnerId: 's2',
      rank: 1,
      screening: screeningOf([['relevance', 5]]),
      humanAvg: 95,
      finalScore: 90,
      evidence: null,
      winnerScores: null,
    })
    expect(r.decisiveGap).toMatch(/winner/i)
  })

  it('falls back to lowest dimension when winner scores unavailable', () => {
    const r = buildProjectReport({
      ...base,
      screening: screeningOf([['relevance', 4], ['implementation', 2]]),
      humanAvg: null,
      finalScore: 18,
      evidence: null,
      winnerScores: null,
    })
    expect(r.decisiveGap).toContain('Implementation quality')
    expect(r.decisiveGap).toContain('2/5')
  })

  it('extracts evidence facts into strings without crashing on junk', () => {
    const r = buildProjectReport({
      ...base,
      screening: null,
      humanAvg: null,
      finalScore: null,
      evidence: {
        commits: { total: 40, eventCommits: 35 },
        freshness: { reason: 'first commit X, 88% during event', likelyPreexisting: false },
        secrets: { critical: 0, high: 1, medium: 2 },
        docs: { readme: true, tests: true, testCount: 12, ci: false },
        vulns: { count: 3 },
        repo: { language: 'TypeScript', stars: 4 },
      },
      winnerScores: null,
    })
    expect(r.strongestDimension).toBe('insufficient evidence')
    const ev = r.sections.find((s) => s.title === 'Evidence highlights')!.body
    expect(ev).toContain('35 in-event / 40 total')
    expect(ev).toContain('1 high')
    expect(ev).toContain('TypeScript')
  })

  it('never throws on empty/garbage input', () => {
    expect(() =>
      buildProjectReport({
        submissionId: '',
        teamName: '',
        winnerId: '',
        rank: NaN,
        totalTeams: NaN,
        screening: { scores: 'junk' as unknown as [] },
        evidence: 'junk' as unknown as Record<string, unknown>,
      }),
    ).not.toThrow()
  })
})
