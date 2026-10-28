import { describe, expect, it } from 'vitest'
import {
  ARENA_DAILY_POINT_CAP,
  ARENA_DIFFICULTY_POINTS,
  arenaPointsFor,
  decideArenaAward,
  utcDayKey,
} from '@/lib/arena-points'
import { ARENA_CHALLENGES } from '@/lib/arena-challenges'
import { CATEGORY_REASONS, buildXpMatch } from '@/lib/leaderboard-calc'

const base = { accepted: true, difficulty: 'medium', alreadyEarned: false, earnedToday: 0 }

describe('arena points rule', () => {
  it('scales by the original difficulty, matching the points shown on each seed card', () => {
    expect(arenaPointsFor('easy')).toBe(100)
    expect(arenaPointsFor('MEDIUM')).toBe(200)
    expect(arenaPointsFor('hard')).toBe(300)
    expect(arenaPointsFor('legendary')).toBe(0)
    expect(arenaPointsFor(undefined)).toBe(0)
    for (const c of ARENA_CHALLENGES) expect(ARENA_DIFFICULTY_POINTS[c.difficulty]).toBe(c.points)
  })

  it('awards only a server-graded accepted result', () => {
    expect(decideArenaAward({ ...base, accepted: false })).toEqual({ points: 0, reason: 'not_accepted' })
    expect(decideArenaAward(base)).toEqual({ points: 200, reason: 'awarded' })
  })

  it('awards once per original question (a rewritten variant earns nothing more)', () => {
    expect(decideArenaAward({ ...base, alreadyEarned: true })).toEqual({ points: 0, reason: 'already_earned' })
  })

  it('refuses unknown questions', () => {
    expect(decideArenaAward({ ...base, difficulty: null })).toEqual({ points: 0, reason: 'unknown_question' })
  })

  it('enforces the daily cap without partial awards', () => {
    expect(decideArenaAward({ ...base, difficulty: 'hard', earnedToday: ARENA_DAILY_POINT_CAP - 300 }).reason).toBe('awarded')
    expect(decideArenaAward({ ...base, difficulty: 'hard', earnedToday: ARENA_DAILY_POINT_CAP - 299 })).toEqual({ points: 0, reason: 'daily_cap' })
    // A smaller question can still fit under the cap.
    expect(decideArenaAward({ ...base, difficulty: 'easy', earnedToday: ARENA_DAILY_POINT_CAP - 100 }).points).toBe(100)
    expect(decideArenaAward({ ...base, difficulty: 'easy', earnedToday: 0, cap: 50 }).reason).toBe('daily_cap')
  })

  it('checks "already earned" before the cap, so the message is accurate', () => {
    expect(decideArenaAward({ ...base, alreadyEarned: true, earnedToday: 10_000 }).reason).toBe('already_earned')
  })

  it('uses the UTC day for the cap', () => {
    expect(utcDayKey(new Date('2026-10-19T23:59:59.999Z'))).toBe('2026-10-19')
    expect(utcDayKey(new Date('2026-10-20T00:00:00.000Z'))).toBe('2026-10-20')
  })

  it('feeds the leaderboard under an Arena category (and global)', () => {
    expect(CATEGORY_REASONS.arena).toEqual(['arena_solved'])
    expect(buildXpMatch('arena', 'all', new Date())).toEqual({ reason: { $in: ['arena_solved'] } })
    expect(CATEGORY_REASONS.global).toBeNull()
  })
})
