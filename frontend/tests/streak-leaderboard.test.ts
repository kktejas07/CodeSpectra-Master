import { describe, expect, it } from 'vitest'
import { computeStreak, dayKey } from '@/lib/streak'
import { assignRanks, buildXpMatch, monthStartIso, parseLeaderboardQuery, rankFromAbove } from '@/lib/leaderboard-calc'
import { completedDaysFrom, difficultyTotals, findSprintProblem, sprintRun } from '@/lib/hundred-days-progress'
import { isReferralEligible, maskEmail, normaliseReferralCode } from '@/lib/referral-rules'
import { quizAttemptGate, revealQuizResults } from '@/app/api/user/courses/_lib/course-rules'

describe('computeStreak', () => {
  const today = '2026-10-18'
  it('is 0 with no activity', () => {
    expect(computeStreak([], today)).toEqual({ current: 0, longest: 0, activeToday: false })
  })
  it('counts consecutive days ending today', () => {
    const r = computeStreak(['2026-10-18', '2026-10-17', '2026-10-16', '2026-10-14'], today)
    expect(r.current).toBe(3)
    expect(r.activeToday).toBe(true)
    expect(r.longest).toBe(3)
  })
  it('keeps yesterday\'s streak alive before today\'s first solve', () => {
    const r = computeStreak(['2026-10-17', '2026-10-16'], today)
    expect(r.current).toBe(2)
    expect(r.activeToday).toBe(false)
  })
  it('resets after a missed day', () => {
    expect(computeStreak(['2026-10-16', '2026-10-15'], today).current).toBe(0)
  })
  it('crosses month and year boundaries', () => {
    expect(computeStreak(['2026-01-01', '2025-12-31', '2025-12-30'], '2026-01-01').current).toBe(3)
    expect(computeStreak(['2026-03-01', '2026-02-28'], '2026-03-01').current).toBe(2)
  })
  it('ignores duplicates, full ISO timestamps, garbage and future days', () => {
    const r = computeStreak(['2026-10-18T09:00:00.000Z', '2026-10-18', 'nope', '2026-10-19', '2026-10-17'], today)
    expect(r.current).toBe(2)
    expect(r.longest).toBe(2)
  })
  it('reports the longest run separately from the current one', () => {
    const r = computeStreak(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-18'], today)
    expect(r.current).toBe(1)
    expect(r.longest).toBe(4)
  })
  it('dayKey uses UTC', () => {
    expect(dayKey(new Date('2026-10-18T23:59:59.000Z'))).toBe('2026-10-18')
    expect(dayKey('2026-10-18T01:00:00Z')).toBe('2026-10-18')
  })
})

describe('leaderboard ranking', () => {
  it('sorts by XP and shares ranks on ties (1, 2, 2, 4)', () => {
    const r = assignRanks([
      { userId: 'c', xp: 50 },
      { userId: 'a', xp: 100 },
      { userId: 'd', xp: 10 },
      { userId: 'b', xp: 50 },
    ])
    expect(r.map((x) => [x.userId, x.rank])).toEqual([['a', 1], ['b', 2], ['c', 2], ['d', 4]])
  })
  it('drops users with no positive XP', () => {
    expect(assignRanks([{ userId: 'a', xp: 0 }, { userId: 'b', xp: -5 }, { userId: 'c', xp: NaN }])).toEqual([])
  })
  it('rank from users above; null without XP', () => {
    expect(rankFromAbove(0, 3)).toBeNull()
    expect(rankFromAbove(10, 0)).toBe(1)
    expect(rankFromAbove(10, 4)).toBe(5)
  })
  it('parses query with safe defaults and caps', () => {
    expect(parseLeaderboardQuery(new URLSearchParams(''))).toEqual({ category: 'global', period: 'all', limit: 80 })
    expect(parseLeaderboardQuery(new URLSearchParams('category=PRACTICE&period=month&limit=999'))).toEqual({ category: 'practice', period: 'month', limit: 100 })
    expect(parseLeaderboardQuery(new URLSearchParams('category=female&limit=-1')).category).toBe('global')
  })
  it('builds the xp_events match per category and period', () => {
    const now = new Date('2026-10-18T12:00:00Z')
    expect(buildXpMatch('global', 'all', now)).toEqual({})
    expect(buildXpMatch('hackathon', 'month', now)).toEqual({
      reason: { $in: ['hackathon_score', 'codeathon_attended'] },
      created_at: { $gte: '2026-10-01T00:00:00.000Z' },
    })
    expect(monthStartIso(new Date('2026-01-31T23:00:00Z'))).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('100-day sprint progress', () => {
  const days = [
    { day: 1, problems: [{ id: 'd1p1', difficulty: 'easy' as const }, { id: 'd1p2', difficulty: 'easy' as const }] },
    { day: 2, problems: [{ id: 'd2p1', difficulty: 'medium' as const }] },
    { day: 3, problems: [{ id: 'd3p1', difficulty: 'hard' as const }] },
  ]
  it('a day is complete only when all its problems are solved', () => {
    expect(completedDaysFrom(['d1p1'], days)).toEqual([])
    expect(completedDaysFrom(['d1p1', 'd1p2', 'd3p1'], days)).toEqual([1, 3])
  })
  it('sprint run counts from day 1 without gaps', () => {
    expect(sprintRun([1, 3])).toBe(1)
    expect(sprintRun([2, 3])).toBe(0)
    expect(sprintRun([1, 2, 3])).toBe(3)
  })
  it('difficulty totals come from the real problem list', () => {
    const t = difficultyTotals(['d1p1', 'd3p1', 'unknown'], days)
    expect(t.easy).toEqual({ solved: 1, total: 2 })
    expect(t.medium).toEqual({ solved: 0, total: 1 })
    expect(t.hard).toEqual({ solved: 1, total: 1 })
    expect(t.all).toEqual({ solved: 2, total: 4 })
  })
  it('finds a problem and its day', () => {
    expect(findSprintProblem('d2p1', days)?.day.day).toBe(2)
    expect(findSprintProblem('nope', days)).toBeNull()
  })
})

describe('referral rules', () => {
  const now = new Date('2026-10-18T12:00:00Z')
  it('only new accounts can redeem', () => {
    expect(isReferralEligible('2026-10-17T12:00:00Z', now)).toBe(true)
    expect(isReferralEligible(new Date('2026-10-12T12:00:00Z'), now)).toBe(true)
    expect(isReferralEligible('2026-10-01T00:00:00Z', now)).toBe(false)
  })
  it('denies unknown or bad creation dates', () => {
    expect(isReferralEligible(undefined, now)).toBe(false)
    expect(isReferralEligible('', now)).toBe(false)
    expect(isReferralEligible('not a date', now)).toBe(false)
    expect(isReferralEligible('2027-01-01T00:00:00Z', now)).toBe(false)
  })
  it('normalises codes and rejects junk', () => {
    expect(normaliseReferralCode(' ab12cd34 ')).toBe('AB12CD34')
    expect(normaliseReferralCode({ $ne: '' })).toBeNull()
    expect(normaliseReferralCode('AB$')).toBeNull()
  })
  it('masks emails', () => {
    expect(maskEmail('jane.doe@example.com')).toBe('j•••@example.com')
    expect(maskEmail(null)).toBe('')
  })
})

describe('course quiz attempts', () => {
  const now = new Date('2026-10-18T12:00:00Z')
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString()
  it('allows attempts under the cap and ignores old ones', () => {
    expect(quizAttemptGate([minsAgo(5), minsAgo(10)], now).ok).toBe(true)
    expect(quizAttemptGate([minsAgo(5), minsAgo(10), minsAgo(90)], now).ok).toBe(true)
  })
  it('blocks after 3 failed attempts in the hour, until the oldest ages out', () => {
    const r = quizAttemptGate([minsAgo(5), minsAgo(10), minsAgo(50)], now)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.retryAfterSec).toBe(10 * 60)
  })
  it('reveals the key only on a pass', () => {
    const rows = [{ questionIndex: 0, userAnswer: 1, correctAnswer: 2, isCorrect: false, explanation: 'because' }]
    expect(revealQuizResults(rows, true)[0].correctAnswer).toBe(2)
    const hidden = revealQuizResults(rows, false)[0]
    expect(hidden.correctAnswer).toBeNull()
    expect(hidden.explanation).toBeUndefined()
    expect(hidden.isCorrect).toBe(false)
  })
})
