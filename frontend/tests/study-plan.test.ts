/**
 * Study plans (pure parts): weak-area detection from mixed signals, the deterministic weekly
 * planner (budget, shares, final phase, Learn matching, practice rounds, day spread), load
 * adaptation and the AI cap check.
 */
import { describe, it, expect } from 'vitest'
import { areaKey, categoryArea, computeWeakAreas, decay, nextDifficultyFor, patternFocus, EMPTY_SIGNALS, type Signals } from '@/lib/study-plan/weak-areas'
import { adaptLoad, addDays, buildWeek, companyLevel, daysBetween, localDay, localHour, matchPost, stableId, summarizeWeek, templateNote, type CatalogPost } from '@/lib/study-plan/planner'
import { aiAllowed, DEFAULT_STUDY_SETTINGS } from '@/lib/study-plan/settings'
import type { PlanTarget, WeakArea } from '@/lib/study-plan/types'

const NOW = Date.parse('2026-10-21T06:00:00Z')
const ans = (domain: string, topic: string | null, difficulty: 'Easy' | 'Medium' | 'Hard', correct: boolean, n = 1) =>
  Array.from({ length: n }, () => ({ domain, topic, difficulty, correct, at: '2026-10-20T00:00:00Z', source: 'test' }))

describe('weak areas', () => {
  it('ranks the area with more wrong answers first and suggests an easier level', () => {
    const s: Signals = { ...EMPTY_SIGNALS, answers: [...ans('sql', 'Joins', 'Medium', false, 8), ...ans('sql', 'Joins', 'Medium', true, 2), ...ans('java', 'Collections', 'Medium', true, 9), ...ans('java', 'Collections', 'Medium', false, 1)] }
    const w = computeWeakAreas(s, { nowMs: NOW })
    expect(w[0].key).toBe('sql::Joins')
    expect(w[0].mastery).toBeLessThan(0.35)
    expect(w[0].next_difficulty).toBe('Easy')
    const java = w.find((x) => x.key === 'java::Collections')!
    expect(java.mastery).toBeGreaterThan(0.75)
    expect(java.next_difficulty).toBe('Hard')
  })

  it('missing hard questions hurts less than missing easy ones', () => {
    const hard = computeWeakAreas({ ...EMPTY_SIGNALS, answers: ans('cse', 'Graphs', 'Hard', false, 6) }, { nowMs: NOW })[0]
    const easy = computeWeakAreas({ ...EMPTY_SIGNALS, answers: ans('cse', 'Graphs', 'Easy', false, 6) }, { nowMs: NOW })[0]
    expect(hard.mastery).toBeGreaterThan(easy.mastery)
  })

  it('little evidence stays near 50 % and has low priority', () => {
    const w = computeWeakAreas({ ...EMPTY_SIGNALS, answers: ans('python', null, 'Medium', false, 1) }, { nowMs: NOW })[0]
    expect(w.mastery).toBeGreaterThan(0.3)
    expect(w.priority).toBeLessThan(0.25)
  })

  it('maps company sections, adaptive peaks and interview scores', () => {
    const s: Signals = {
      answers: [],
      sections: [{ categories: ['quant'], percent: 30, questions: 20, at: '2026-10-19T00:00:00Z', source: 'company' }],
      adaptive: [{ domain: 'java', peak: 'Easy', at: '2026-10-19T00:00:00Z' }],
      interviews: [{ category: 'Communication', score: 0.4, at: '2026-10-19T00:00:00Z' }],
    }
    const keys = computeWeakAreas(s, { nowMs: NOW }).map((w) => w.key)
    expect(keys).toContain('aptitude::Quantitative aptitude')
    expect(keys).toContain('java')
    expect(keys).toContain('interview::Communication')
    expect(keys[0]).toBe('aptitude::Quantitative aptitude') // 20 questions at 30 % outweighs the rest
  })

  it('cold-start focus areas appear with a middling priority', () => {
    const w = computeWeakAreas(EMPTY_SIGNALS, { nowMs: NOW, focus: patternFocus([{ categories: ['quant', 'logical'] }, { categories: ['coding'] }]) })
    expect(w.map((x) => x.key)).toEqual(['aptitude::Logical reasoning', 'aptitude::Quantitative aptitude', 'cse::Data structures and algorithms'])
    expect(w.every((x) => x.evidence === 0 && x.priority === 0.3)).toBe(true)
  })

  it('old results count less (45-day half-life)', () => {
    expect(decay('2026-09-06T06:00:00Z', NOW)).toBeCloseTo(0.5, 2)
    expect(decay(null, NOW)).toBe(1)
    expect(nextDifficultyFor(0.44)).toBe('Easy')
    expect(nextDifficultyFor(0.6)).toBe('Medium')
    expect(categoryArea('Coding')).toEqual({ domain: 'cse', topic: 'Data structures and algorithms' })
    expect(areaKey('SQL', '  Joins  ')).toBe('sql::Joins')
  })
})

const posts: CatalogPost[] = [
  { slug: 'sql-joins', title: 'SQL joins explained', tags: ['joins', 'sql'], category: 'databases', level: 'beginner', reading_minutes: 9 },
  { slug: 'sql-indexes', title: 'Indexes', tags: ['indexes'], category: 'databases', level: 'advanced', reading_minutes: 12 },
  { slug: 'percentages', title: 'Quantitative aptitude: percentages', tags: ['quantitative', 'aptitude'], category: 'interview-prep', level: 'beginner', reading_minutes: 7 },
  { slug: 'graphs', title: 'Graph traversal', tags: ['graphs', 'bfs'], category: 'dsa', level: 'intermediate', reading_minutes: 14 },
]
const area = (key: string, mastery: number, priority: number, evidence = 10): WeakArea => {
  const [domain, topic = null] = key.split('::') as [string, string?]
  return { key, domain, topic: topic ?? null, label: key, mastery, evidence, priority, next_difficulty: nextDifficultyFor(mastery), sources: ['test'] }
}
const skills: PlanTarget = { kind: 'skills', label: 'SQL', domains: ['sql'], start_date: '2026-10-21', days: 30, hours_per_week: 6 }
const company: PlanTarget = { kind: 'company', pattern_id: 'tcs-nqt', label: 'TCS NQT', domains: [], start_date: '2026-10-21', days: 30, hours_per_week: 10 }

describe('planner', () => {
  it('is deterministic and fits the hours budget', () => {
    const input = { target: skills, weakAreas: [area('sql::Joins', 0.3, 0.6), area('cse::Graphs', 0.5, 0.4), area('sql::Indexes', 0.5, 0.35), area('sql::Transactions', 0.5, 0.3), area('sql::Subqueries', 0.6, 0.25)], catalog: { posts }, weekNo: 1, startDay: '2026-10-21', daysLeft: 30, loadFactor: 1 }
    const a = buildWeek(input)
    const b = buildWeek(input)
    expect(a).toEqual(b)
    const minutes = a.items.reduce((s, i) => s + i.minutes, 0)
    expect(minutes).toBeLessThanOrEqual(6 * 60)
    expect(minutes).toBeGreaterThan(6 * 60 * 0.7)
    expect(a.start).toBe('2026-10-21')
    expect(a.end).toBe('2026-10-27')
    expect(new Set(a.items.map((i) => i.id)).size).toBe(a.items.length)
  })

  it('picks a matching Learn post for the weakest area and never one already read', () => {
    const w = buildWeek({ target: skills, weakAreas: [area('sql::Joins', 0.3, 0.6)], catalog: { posts }, weekNo: 1, startDay: '2026-10-21', daysLeft: 30, loadFactor: 1 })
    expect(w.items.find((i) => i.kind === 'learn')?.ref.slug).toBe('sql-joins')
    const w2 = buildWeek({ target: skills, weakAreas: [area('sql::Joins', 0.3, 0.6)], catalog: { posts }, weekNo: 2, startDay: '2026-10-28', daysLeft: 23, loadFactor: 1, readSlugs: ['sql-joins'] })
    expect(w2.items.find((i) => i.kind === 'learn')?.ref.slug).toBe('sql-indexes')
    expect(matchPost(area('cse::Graphs', 0.5, 0.4), posts, new Set())?.slug).toBe('graphs')
  })

  it('practice sets at the area difficulty, at most three per area, weakest gets more', () => {
    const w = buildWeek({ target: { ...skills, hours_per_week: 20 }, weakAreas: [area('sql::Joins', 0.3, 0.6), area('java', 0.8, 0.05)], catalog: { posts: [] }, weekNo: 1, startDay: '2026-10-21', daysLeft: 30, loadFactor: 1 })
    const sql = w.items.filter((i) => i.kind === 'practice' && i.area_key === 'sql::Joins')
    const java = w.items.filter((i) => i.kind === 'practice' && i.area_key === 'java')
    expect(sql.length).toBe(3)
    expect(java.length).toBe(1)
    expect(sql[0].ref).toMatchObject({ domain: 'sql', topic: 'Joins', count: 10 })
    expect(sql.map((i) => i.ref.difficulty)).toContain('Easy')
    expect(sql.every((i) => i.href.startsWith('/dashboard/study-plan/practice/'))).toBe(true)
  })

  it('company target: timed company test on the last day, two in the final phase, level by mastery', () => {
    const cat = { posts, pattern: { id: 'tcs-nqt', label: 'TCS NQT', minutes: 90 } }
    const w1 = buildWeek({ target: company, weakAreas: [area('aptitude::Quantitative aptitude', 0.4, 0.5)], catalog: cat, weekNo: 1, startDay: '2026-10-21', daysLeft: 30, loadFactor: 1 })
    const t1 = w1.items.filter((i) => i.kind === 'company_test')
    expect(t1).toHaveLength(1)
    expect(t1[0].day).toBe('2026-10-27')
    expect(t1[0].ref).toMatchObject({ pattern_id: 'tcs-nqt', level: 'easy' })
    const w4 = buildWeek({ target: company, weakAreas: [area('aptitude::Quantitative aptitude', 0.8, 0.1)], catalog: cat, weekNo: 4, startDay: '2026-11-11', daysLeft: 7, loadFactor: 1 })
    const t4 = w4.items.filter((i) => i.kind === 'company_test')
    expect(t4).toHaveLength(2)
    expect(t4[0].ref.level).toBe('tough')
  })

  it('a weak interview area adds a mock interview; daily challenges every day', () => {
    const w = buildWeek({ target: skills, weakAreas: [area('interview::Communication', 0.4, 0.5), area('sql::Joins', 0.3, 0.4)], catalog: { posts }, weekNo: 1, startDay: '2026-10-21', daysLeft: 30, loadFactor: 1 })
    expect(w.items.some((i) => i.kind === 'interview')).toBe(true)
    const daily = w.items.filter((i) => i.kind === 'daily_challenge')
    expect(new Set(daily.map((i) => i.day)).size).toBe(daily.length)
    expect(daily.length).toBeGreaterThanOrEqual(1)
  })

  it('short final week only has the remaining days', () => {
    const w = buildWeek({ target: skills, weakAreas: [area('sql::Joins', 0.3, 0.6)], catalog: { posts }, weekNo: 5, startDay: '2026-11-18', daysLeft: 3, loadFactor: 1 })
    expect(w.end).toBe('2026-11-20')
    expect(new Set(w.items.map((i) => i.day)).size).toBeLessThanOrEqual(3)
  })

  it('stable ids are stable and distinct', () => {
    expect(stableId('1|practice|sql::Joins:0')).toBe(stableId('1|practice|sql::Joins:0'))
    expect(stableId('1|practice|sql::Joins:0')).not.toBe(stableId('1|practice|sql::Joins:1'))
    expect(stableId('x')).toMatch(/^[a-z0-9]{1,16}$/)
  })
})

describe('adaptation, dates, caps', () => {
  it('load drops when little was done and rises when nearly all was done (0.6–1.2)', () => {
    expect(adaptLoad(1, { minutes_planned: 600, minutes_done: 100 })).toBe(0.8)
    expect(adaptLoad(1, { minutes_planned: 600, minutes_done: 360 })).toBe(0.9)
    expect(adaptLoad(1, { minutes_planned: 600, minutes_done: 600 })).toBe(1.1)
    expect(adaptLoad(0.6, { minutes_planned: 600, minutes_done: 0 })).toBe(0.6)
    expect(adaptLoad(1.2, { minutes_planned: 600, minutes_done: 600 })).toBe(1.2)
  })
  it('summaries count done items and minutes', () => {
    const w = buildWeek({ target: skills, weakAreas: [area('sql::Joins', 0.3, 0.6)], catalog: { posts }, weekNo: 1, startDay: '2026-10-21', daysLeft: 30, loadFactor: 1 })
    w.items[0].done_at = '2026-10-21T10:00:00Z'
    const s = summarizeWeek(w)
    expect(s.done).toBe(1)
    expect(s.minutes_done).toBe(w.items[0].minutes)
    expect(templateNote(w, [area('sql::Joins', 0.3, 0.6)], s)).toContain('Joins')
  })
  it('company level follows mastery of tested areas', () => {
    expect(companyLevel([])).toBe('easy')
    expect(companyLevel([area('a', 0.6, 0.2)])).toBe('moderate')
    expect(companyLevel([area('a', 0.9, 0.1)])).toBe('tough')
  })
  it('local day / hour in the learner time zone', () => {
    expect(localDay(Date.parse('2026-10-21T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-10-22')
    expect(localHour(Date.parse('2026-10-21T13:30:00Z'), 'Asia/Kolkata')).toBe(19)
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(daysBetween('2026-10-21', '2026-10-28')).toBe(7)
  })
  it('AI note caps: off switch, daily count and monthly cost', () => {
    const now = new Date('2026-10-21T06:00:00Z')
    const u = { day: '2026-10-21', day_count: 0, month: '2026-10', month_cost_usd: 0 }
    expect(aiAllowed(DEFAULT_STUDY_SETTINGS, u, now).ok).toBe(true)
    expect(aiAllowed({ ...DEFAULT_STUDY_SETTINGS, ai_notes: false }, u, now).ok).toBe(false)
    expect(aiAllowed(DEFAULT_STUDY_SETTINGS, { ...u, day_count: 300 }, now).ok).toBe(false)
    expect(aiAllowed(DEFAULT_STUDY_SETTINGS, { ...u, month_cost_usd: 3 }, now).ok).toBe(false)
    expect(aiAllowed(DEFAULT_STUDY_SETTINGS, { ...u, day: '2026-10-20', day_count: 999 }, now).ok).toBe(true)
  })
})
