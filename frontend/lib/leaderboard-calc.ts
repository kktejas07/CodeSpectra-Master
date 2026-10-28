/**
 * Leaderboard maths (pure — no DB). XP lives in `xp_events`; the route sums
 * it per user with the match built here and ranks the totals with
 * `assignRanks`.
 */

export type LeaderboardCategory = 'global' | 'practice' | 'hackathon' | 'exams' | 'arena'
export type LeaderboardPeriod = 'all' | 'month'

/** Which xp_events reasons count towards each category (null = every reason). */
export const CATEGORY_REASONS: Record<LeaderboardCategory, string[] | null> = {
  global: null,
  practice: ['submission_accepted', 'first_blood', 'challenge_completed'],
  hackathon: ['hackathon_score', 'codeathon_attended', 'codeathon_result'],
  exams: ['exam_passed', 'certification_passed'],
  /** Arena points (lib/arena-points.ts): once per original question, daily cap. */
  arena: ['arena_solved'],
}

export function parseLeaderboardQuery(params: URLSearchParams): {
  category: LeaderboardCategory
  period: LeaderboardPeriod
  limit: number
} {
  const c = (params.get('category') || 'global').toLowerCase()
  const category = (c in CATEGORY_REASONS ? c : 'global') as LeaderboardCategory
  const period: LeaderboardPeriod = params.get('period') === 'month' ? 'month' : 'all'
  const raw = Number(params.get('limit'))
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(100, Math.floor(raw)) : 80
  return { category, period, limit }
}

/** Start of the current UTC calendar month as an ISO string. */
export function monthStartIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

/** `$match` filter for xp_events (without the per-user part). */
export function buildXpMatch(
  category: LeaderboardCategory,
  period: LeaderboardPeriod,
  now: Date,
): Record<string, unknown> {
  const match: Record<string, unknown> = {}
  const reasons = CATEGORY_REASONS[category]
  if (reasons) match.reason = { $in: reasons }
  if (period === 'month') match.created_at = { $gte: monthStartIso(now) }
  return match
}

/**
 * Competition ranking ("1, 2, 2, 4"): equal XP shares a rank. Rows with no
 * positive XP are dropped. Ties are ordered by userId so the list is stable.
 */
export function assignRanks<T extends { userId: string; xp: number }>(rows: T[]): Array<T & { rank: number }> {
  const sorted = rows
    .filter((r) => Number.isFinite(r.xp) && r.xp > 0)
    .sort((a, b) => b.xp - a.xp || a.userId.localeCompare(b.userId))
  let rank = 0
  let prevXp: number | null = null
  return sorted.map((r, i) => {
    if (r.xp !== prevXp) {
      rank = i + 1
      prevXp = r.xp
    }
    return { ...r, rank }
  })
}

/** Rank for a user given how many users have strictly more XP; null when they have none. */
export function rankFromAbove(myXp: number, usersAbove: number): number | null {
  return myXp > 0 ? usersAbove + 1 : null
}
