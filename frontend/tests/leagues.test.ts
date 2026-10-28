import { describe, expect, it } from 'vitest'
import {
  buildLedger, collegeBoard, decayWeight, eventPoints, individualBoard, maskedName, placementPoints, seasonBadges, teamBoard, type LeagueEvent,
} from '@/lib/leagues/points'
import { DEFAULT_SEASON_CONFIG, mergeConfig, quarterWindow, seasonConfigSchema, seasonPhase, type SeasonConfig } from '@/lib/leagues/types'
import { pickCurrent } from '@/lib/leagues/service'

const cfg: SeasonConfig = { ...DEFAULT_SEASON_CONFIG, decay: { half_life_days: 0, floor: 0.5 } }
const ref = new Date('2026-12-31T00:00:00Z')

function ev(key: string, entries: Array<[string[], number | null]>, extra: Partial<LeagueEvent> = {}): LeagueEvent {
  return {
    key, kind: 'contest', title: key, ended_at: '2026-12-01T00:00:00Z', difficulty: 'medium',
    ranked: entries.filter(([, r]) => r !== null).length,
    entries: entries.map(([member_ids, rank]) => ({ member_ids, rank })), ...extra,
  }
}

describe('placement points', () => {
  it('uses the table, then slides down to the minimum', () => {
    expect(placementPoints(1, 20, cfg)).toBe(100)
    expect(placementPoints(10, 20, cfg)).toBe(30)
    expect(placementPoints(11, 20, cfg)).toBe(25)
    expect(placementPoints(20, 20, cfg)).toBe(2)
    expect(placementPoints(null, 20, cfg)).toBe(0)
  })
  it('gives nothing for placement in tiny events', () => {
    expect(placementPoints(1, 2, cfg)).toBe(0)
  })
  it('decays older events to the floor', () => {
    const c = { decay: { half_life_days: 30, floor: 0.5 } }
    expect(decayWeight('2026-12-31T00:00:00Z', ref, c)).toBe(1)
    expect(decayWeight('2026-12-01T00:00:00Z', ref, c)).toBeCloseTo(0.5, 2)
    expect(decayWeight('2026-01-01T00:00:00Z', ref, c)).toBe(0.5)
    expect(decayWeight('2026-01-01T00:00:00Z', ref, { decay: { half_life_days: 0, floor: 0 } })).toBe(1)
  })
})

describe('event points and boards', () => {
  const contest = ev('contest:a', [[['u1'], 1], [['u2', 'u3'], 2], [['u4'], 3], [['u5'], null]])
  const hard = ev('codeathon:b', [[['u2'], 1], [['u1'], 2], [['u6'], 3]], { kind: 'codeathon', difficulty: 'hard' })

  it('applies participation, difficulty and shares team results', () => {
    const p = eventPoints(contest, cfg, ref)
    expect(p.get('u1')).toBe((100 + 5) * 1.25)
    expect(p.get('u2')).toBe((80 + 5) * 1.25)
    expect(p.get('u3')).toBe(p.get('u2'))
    expect(p.get('u5')).toBe(5 * 1.25)
    expect(eventPoints(hard, cfg, ref).get('u2')).toBe(105 * 1.5)
  })

  it('respects disabled sources and per-event difficulty overrides', () => {
    expect(eventPoints(hard, { ...cfg, sources: { ...cfg.sources, codeathon: false } }, ref).size).toBe(0)
    expect(eventPoints(contest, { ...cfg, event_difficulty: { 'contest:a': 'easy' } }, ref).get('u1')).toBe(105)
  })

  it('builds individual, college and team boards', () => {
    const ledger = buildLedger([contest, hard], new Map([['u7', 100], ['u1', 3]]), cfg, ref)
    expect(ledger.get('u7')!.arena).toBe(60)
    expect(ledger.get('u1')!.best_rank).toBe(1)
    const colleges = new Map([['u1', 'c1'], ['u2', 'c1'], ['u3', 'c2'], ['u4', 'c2']])
    const ind = individualBoard(ledger, colleges)
    expect(ind[0]).toMatchObject({ user_id: 'u2', rank: 1, college_id: 'c1', events: 2 })
    expect(ind.find((r) => r.user_id === 'u1')!.points).toBe(261.8) // 131.25 + 127.5 + 3 arena
    const col = collegeBoard(ind, { college_top_k: 1 })
    expect(col.map((c) => c.college_id)).toEqual(['c1', 'c2'])
    expect(col[0]).toMatchObject({ scoring_students: 1, students: 2 })
    // Team u1+u2: per event the best member (contest: u1 131.25, codeathon: u2 157.5) + arena 3.
    const teams = teamBoard([{ id: 't1', member_ids: ['u1', 'u2'] }, { id: 't2', member_ids: ['u3'] }, { id: 't3', member_ids: ['nobody'] }], ledger)
    expect(teams).toHaveLength(2)
    expect(teams[0]).toMatchObject({ team_id: 't1', points: 291.8, events: 2 })
  })

  it('awards badges to the top of each board, ties included', () => {
    const b = seasonBadges({
      individual: [{ rank: 1, user_id: 'a', points: 9, events: 1, best_rank: 1, college_id: null }, { rank: 1, user_id: 'b', points: 9, events: 1, best_rank: 1, college_id: null }, { rank: 3, user_id: 'c', points: 1, events: 1, best_rank: 2, college_id: null }],
      colleges: [{ rank: 1, college_id: 'c1', points: 5, scoring_students: 1, students: 1 }, { rank: 2, college_id: 'c2', points: 1, scoring_students: 1, students: 1 }],
      teams: [],
    }, { badges: { individual_top_n: 2, college_top_n: 1, team_top_n: 3 } })
    expect(b.map((x) => `${x.subject}:${x.subject_id}:${x.badge}`)).toEqual(['user:a:champion', 'user:b:champion', 'college:c1:champion'])
  })
})

describe('season config and helpers', () => {
  it('merges partial configs over the defaults and rejects bad ones', () => {
    expect(mergeConfig({ decay: { half_life_days: 30 } }).decay).toEqual({ half_life_days: 30, floor: 0.5 })
    expect(mergeConfig({ team: { min_size: 6, max_size: 2 } })).toEqual(DEFAULT_SEASON_CONFIG)
    expect(seasonConfigSchema.safeParse(DEFAULT_SEASON_CONFIG).success).toBe(true)
  })
  it('suggests the calendar quarter', () => {
    expect(quarterWindow(new Date('2026-10-21T00:00:00Z'))).toMatchObject({ name: 'Q4 2026 league', slug: 'q4-2026', starts_at: '2026-10-01T00:00:00.000Z', ends_at: '2026-12-31T23:59:59.999Z' })
  })
  it('season phase and current season', () => {
    const mk = (id: string, status: 'draft' | 'published' | 'finalized', s: string, e: string) => ({ id, slug: id, name: id, status, starts_at: s, ends_at: e, config: DEFAULT_SEASON_CONFIG, finalized_at: null, created_by: '', created_at: '', updated_at: '' })
    const now = new Date('2026-10-21T00:00:00Z')
    const q3 = mk('q3', 'finalized', '2026-07-01T00:00:00Z', '2026-09-30T00:00:00Z')
    const q4 = mk('q4', 'published', '2026-10-01T00:00:00Z', '2026-12-31T00:00:00Z')
    const draft = mk('d', 'draft', '2026-10-01T00:00:00Z', '2026-12-31T00:00:00Z')
    expect(seasonPhase(q4, now)).toBe('live')
    expect(seasonPhase(q3, now)).toBe('final')
    expect(pickCurrent([draft, q4, q3], now)?.id).toBe('q4')
    expect(pickCurrent([draft, q3], now)?.id).toBe('q3')
    expect(pickCurrent([draft], now)).toBeNull()
  })
  it('masks public names', () => {
    expect(maskedName('Priya Sharma')).toBe('Priya S.')
    expect(maskedName('Ravi')).toBe('Ravi')
    expect(maskedName('x@y.com')).toBe('Participant')
  })
})
