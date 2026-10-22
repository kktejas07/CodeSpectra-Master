/** Employer hiring analytics — pure maths and shaping (lib/ats/psychometrics.ts, lib/ats/hiring-insights.ts). */
import { describe, expect, it } from 'vitest'
import { describe as stats, flagsFor, histogram, itemStats, itemStatsFromSums, pearsonFromSums, pointBiserial, sumsOf } from '@/lib/ats/psychometrics'
import { calibration, digestRange, digestUnsubToken, digestUnsubTokenOk, digestWorthSending, funnelRows, offerSummary, parseFilters, sourceRows, toCsv } from '@/lib/ats/hiring-insights'

describe('psychometrics', () => {
  // 0/1 item on 10 candidates; strong candidates (high totals) tend to get it right.
  const item = [1, 1, 1, 1, 1, 0, 1, 0, 0, 0]
  const totals = [9, 9, 8, 8, 7, 6, 5, 4, 3, 2]

  it('p-value is the share of marks earned', () => {
    expect(itemStats(item, totals, 1).p).toBe(0.6)
    expect(itemStats([2, 4, 0], [5, 9, 1], 4).p).toBe(0.5)
  })

  it('sums-based stats match the raw computation (corrected item-total r)', () => {
    const raw = itemStats(item, totals, 1)
    const fromSums = itemStatsFromSums(sumsOf(item, totals), 1)
    expect(fromSums).toEqual(raw)
    // Corrected r = Pearson(item, total − item).
    const rest = totals.map((t, i) => t - item[i])
    const n = item.length
    const r = pearsonFromSums(n, item.reduce((a, b) => a + b, 0), rest.reduce((a, b) => a + b, 0), item.reduce((a, b) => a + b * b, 0), rest.reduce((a, b) => a + b * b, 0), item.reduce((a, x, i) => a + x * rest[i], 0))
    expect(raw.r).toBeCloseTo(r as number, 3)
    expect(raw.r).toBeGreaterThan(0.5)
  })

  it('point-biserial matches Pearson for a 0/1 item', () => {
    const pb = pointBiserial(item.map(Boolean), totals) as number
    const r = pearsonFromSums(10, 6, totals.reduce((a, b) => a + b, 0), 6, totals.reduce((a, b) => a + b * b, 0), item.reduce((a, x, i) => a + x * totals[i], 0)) as number
    expect(pb).toBeCloseTo(r, 6)
    expect(pointBiserial([true, true], [1, 2])).toBeNull()
  })

  it('no variance → r null; reversed item → negative r', () => {
    expect(itemStats([1, 1, 1], [3, 2, 1], 1).r).toBeNull()
    const rev = item.map((x) => 1 - x)
    expect(itemStats(rev, totals.map((t, i) => t - item[i] + rev[i]), 1).r).toBeLessThan(0)
  })

  it('flags follow the rules of thumb, and few responses are never flagged otherwise', () => {
    expect(flagsFor(5, 0.95, -0.4)).toEqual(['few_responses'])
    expect(flagsFor(50, 0.95, 0.4)).toEqual(['too_easy'])
    expect(flagsFor(50, 0.1, 0.1)).toEqual(['too_hard', 'weak_discrimination'])
    expect(flagsFor(50, 0.5, -0.2)).toEqual(['negative_discrimination'])
    expect(itemStatsFromSums({ n: 0, sx: 0, sxx: 0, sT: 0, sTT: 0, sxT: 0 }, 1)).toEqual({ n: 0, p: null, r: null, mean: null, flags: ['few_responses'] })
  })

  it('histogram buckets 0–100 (100 in the last bin) and describe()', () => {
    const h = histogram([0, 5, 10, 55, 99.9, 100], 10)
    expect(h).toHaveLength(10)
    expect(h[0].count).toBe(2)
    expect(h[1].count).toBe(1)
    expect(h[9].count).toBe(2)
    expect(stats([1, 2, 3, 4])).toEqual({ n: 4, mean: 2.5, median: 2.5, sd: 1.3 })
  })
})

describe('funnel, sources, offers', () => {
  it('funnel rows add conversion and drop-off from the previous stage', () => {
    const rows = funnelRows(
      [{ key: 'applied', name: 'Applied', type: 'applied' }, { key: 'screening', name: 'Screening', type: 'screening' }, { key: 'hired', name: 'Hired', type: 'hired' }],
      new Map([['applied', 100], ['screening', 40], ['hired', 10]]),
      new Map([['applied', [1, 2, 3]], ['screening', [4]]]),
    )
    expect(rows.map((r) => [r.conversion_pct, r.dropoff_pct, r.median_days])).toEqual([[null, null, 2], [40, 60, 4], [25, 75, null]])
  })

  it('source rows compute hire / interview rates and share, biggest first', () => {
    const r = sourceRows([
      { source: 'referral', total: 10, hired: 3, rejected: 2, active: 5, reached_interview: 6, match_sum: 800, match_n: 10 },
      { source: 'apply_page', total: 90, hired: 3, rejected: 50, active: 37, reached_interview: 9, match_sum: 0, match_n: 0 },
    ])
    expect(r[0]).toMatchObject({ source: 'apply_page', share_pct: 90, hire_rate_pct: 3.3, interview_rate_pct: 10, avg_match: null })
    expect(r[1]).toMatchObject({ source: 'referral', hire_rate_pct: 30, interview_rate_pct: 60, avg_match: 80 })
  })

  it('offer acceptance counts decided offers only', () => {
    expect(offerSummary({ offered: 10, accepted: 6, declined: 2, pending: 2 }).acceptance_pct).toBe(75)
    expect(offerSummary({ offered: 2, accepted: 0, declined: 0, pending: 2 }).acceptance_pct).toBeNull()
  })
})

describe('interviewer calibration', () => {
  const agg = (id: string, scores: number[]) => ({ interviewer_id: id, n: scores.length, sum: scores.reduce((a, b) => a + b, 0), sumSq: scores.reduce((a, b) => a + b * b, 0), strong_yes: 0, yes: scores.filter((s) => s >= 3.5).length, no: scores.filter((s) => s < 3.5).length, strong_no: 0 })
  it('flags lenient, harsh and narrow raters relative to the panel (≥ 5 scorecards)', () => {
    const r = calibration([agg('a', [4.5, 4.8, 4.6, 4.9, 4.7]), agg('b', [2, 2.5, 2.2, 2.8, 2.1]), agg('c', [3.5, 3.5, 3.6, 3.5, 3.5]), agg('d', [5, 1])], new Map([['a', 'Asha']]))
    const by = Object.fromEntries(r.interviewers.map((x) => [x.interviewer_id, x]))
    expect(by.a.flag).toBe('lenient')
    expect(by.a.name).toBe('Asha')
    expect(by.b.flag).toBe('harsh')
    expect(by.c.flag).toBe('narrow')
    expect(by.d.flag).toBeNull()
    expect(by.d.sd).toBeCloseTo(2.83, 2)
    expect(r.overall_mean).toBeCloseTo((4.5 + 4.8 + 4.6 + 4.9 + 4.7 + 2 + 2.5 + 2.2 + 2.8 + 2.1 + 3.5 + 3.5 + 3.6 + 3.5 + 3.5 + 6) / 17, 2)
  })
})

describe('filters, CSV, digest', () => {
  it('parses filters safely', () => {
    const f = parseFilters(new URLSearchParams({ job_id: 'job-1', client_id: '$bad', from: '2026-10-01', to: '2026-09-01' }))
    expect(f).toEqual({ job_id: 'job-1', client_id: null, from: '2026-09-01T00:00:00.000Z', to: '2026-10-02T00:00:00.000Z' })
    const p = parseFilters(new URLSearchParams({ preset: '30d' }), new Date('2026-10-31T12:00:00Z'))
    expect(p.from).toBe('2026-10-01T00:00:00.000Z')
    expect(parseFilters(new URLSearchParams({ preset: '9999d', from: 'yesterday' })).from).toBeNull()
  })

  it('CSV escapes quotes / commas / newlines and neutralises formulas', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'he said "hi"'], ['=SUM(A1)', null], [-5, 'line\nbreak']])).toBe('a,b\r\n"x,y","he said ""hi"""\r\n\'=SUM(A1),\r\n-5,"line\nbreak"\r\n')
  })

  it('digest range is the 7 days before today (UTC), tokens verify per tenant + user', () => {
    expect(digestRange(new Date('2026-10-26T03:30:00Z'))).toEqual({ from: '2026-10-19T00:00:00.000Z', to: '2026-10-26T00:00:00.000Z' })
    const key = new Uint8Array(32).fill(7)
    const tok = digestUnsubToken(key, 't1', 'u1')
    expect(digestUnsubTokenOk(key, 't1', 'u1', tok)).toBe(true)
    expect(digestUnsubTokenOk(key, 't1', 'u2', tok)).toBe(false)
    expect(digestUnsubTokenOk(key, 't1', 'u1', 'short')).toBe(false)
    expect(digestWorthSending({ applications: 0, hires: 0, offers: 0, offers_accepted: 0, median_time_to_hire_days: null, top_source: null, open_jobs: 0 })).toBe(false)
  })
})
