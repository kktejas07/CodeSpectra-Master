/**
 * Arena points rule (pure — no DB). Arena problems can be AI-rewritten per
 * user, so points are tied to the ORIGINAL seed question, never the variant:
 *
 *  1. Only a server-graded, fully accepted submit earns points (the server
 *     grades against its own copy of the tests — the seed's, or the stored
 *     variant's — never tests sent by the client).
 *  2. Points come from the original question's difficulty
 *     (easy 100 / medium 200 / hard 300 — the scale shown on arena cards).
 *  3. Once per user per original question id: solving a second rewrite of
 *     the same question earns nothing.
 *  4. Daily cap (UTC day): an award that would push the day's arena points
 *     over the cap is NOT made and the question is NOT marked as earned, so
 *     the user can earn it on a later day. No partial awards.
 */
import type { ArenaDifficulty } from '@/lib/arena-challenges'

export const ARENA_DIFFICULTY_POINTS: Record<ArenaDifficulty, number> = {
  easy: 100,
  medium: 200,
  hard: 300,
}

/** Max arena points per user per UTC day (two hard questions). */
export const ARENA_DAILY_POINT_CAP = 600

/** xp_events reason for arena awards (the leaderboard's "Arena" source). */
export const ARENA_XP_REASON = 'arena_solved' as const

export function arenaPointsFor(difficulty: string | null | undefined): number {
  const d = String(difficulty ?? '').toLowerCase() as ArenaDifficulty
  return ARENA_DIFFICULTY_POINTS[d] ?? 0
}

/** UTC calendar day, e.g. "2026-10-19". */
export function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export type ArenaAwardReason = 'awarded' | 'not_accepted' | 'already_earned' | 'daily_cap' | 'unknown_question'

export interface ArenaAwardDecision {
  points: number
  reason: ArenaAwardReason
}

export function decideArenaAward(input: {
  accepted: boolean
  difficulty: string | null | undefined
  alreadyEarned: boolean
  earnedToday: number
  cap?: number
}): ArenaAwardDecision {
  const cap = input.cap ?? ARENA_DAILY_POINT_CAP
  if (!input.accepted) return { points: 0, reason: 'not_accepted' }
  const points = arenaPointsFor(input.difficulty)
  if (points <= 0) return { points: 0, reason: 'unknown_question' }
  if (input.alreadyEarned) return { points: 0, reason: 'already_earned' }
  if (Math.max(0, input.earnedToday) + points > cap) return { points: 0, reason: 'daily_cap' }
  return { points, reason: 'awarded' }
}
