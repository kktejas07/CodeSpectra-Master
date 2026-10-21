/**
 * Team & university leagues — seasons, config and stored shapes (client-safe).
 *
 *   league_seasons    one per season (e.g. a quarter): window + scoring config
 *   league_teams      teams registered for a season (2–5 members, join code)
 *   league_snapshots  frozen boards written when a season is finalised
 *   league_badges     season-end badges (individual, college, team)
 *
 * Points come from released results that already exist on the platform:
 * hosted contests (contest_results), codeathons (codeathon_results),
 * hackathons (released judged rankings) and arena solves (xp_events). The
 * maths is in ./points (pure, tested).
 */
import { z } from 'zod'

export type EventKind = 'contest' | 'codeathon' | 'hackathon'
export type Difficulty = 'easy' | 'medium' | 'hard'

export interface SeasonConfig {
  /** Points for places 1..N; places after that slide linearly down to `beyond_top_min`. */
  placement_points: number[]
  beyond_top_max: number
  beyond_top_min: number
  /** Every entry that took part (ranked or not). */
  participation_points: number
  difficulty_multipliers: Record<Difficulty, number>
  /** Older events count less: weight = max(floor, 0.5^(age / half_life)). half_life 0 = off. */
  decay: { half_life_days: number; floor: number }
  /** Below this many ranked entries an event gives participation points only. */
  min_ranked_entries: number
  arena: { points_per_solve: number; max_per_season: number }
  /** College score = sum of its best K students. */
  college_top_k: number
  sources: Record<EventKind | 'arena', boolean>
  team: { min_size: number; max_size: number }
  badges: { individual_top_n: number; college_top_n: number; team_top_n: number }
  /** Per-event difficulty override: { 'contest:<id>': 'hard' }. */
  event_difficulty: Record<string, Difficulty>
}

export const DEFAULT_SEASON_CONFIG: SeasonConfig = {
  placement_points: [100, 80, 65, 55, 50, 45, 40, 36, 33, 30],
  beyond_top_max: 25,
  beyond_top_min: 2,
  participation_points: 5,
  difficulty_multipliers: { easy: 1, medium: 1.25, hard: 1.5 },
  decay: { half_life_days: 60, floor: 0.5 },
  min_ranked_entries: 3,
  arena: { points_per_solve: 1, max_per_season: 60 },
  college_top_k: 25,
  sources: { contest: true, codeathon: true, hackathon: true, arena: true },
  team: { min_size: 2, max_size: 5 },
  badges: { individual_top_n: 10, college_top_n: 3, team_top_n: 3 },
  event_difficulty: {},
}

export type SeasonStatus = 'draft' | 'published' | 'finalized'

export interface SeasonDoc {
  id: string
  slug: string
  name: string
  starts_at: string
  ends_at: string
  status: SeasonStatus
  config: SeasonConfig
  finalized_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface LeagueTeamDoc {
  id: string
  season_id: string
  name: string
  slug: string
  captain_id: string
  member_ids: string[]
  /** College (tenant id) when every member is a verified student of it. */
  college_id: string | null
  join_code_hash: string
  created_at: string
  updated_at: string
}

export interface BadgeDoc {
  id: string
  season_id: string
  season_name: string
  subject: 'user' | 'college' | 'team'
  subject_id: string
  /** For team badges: every member gets a copy keyed by user. */
  user_id: string | null
  badge: 'champion' | 'runner_up' | 'third' | 'top_n'
  rank: number
  label: string
  awarded_at: string
}

const num = (min: number, max: number) => z.number().min(min).max(max)

export const seasonConfigSchema = z.object({
  placement_points: z.array(num(0, 10_000)).min(1).max(50),
  beyond_top_max: num(0, 10_000),
  beyond_top_min: num(0, 10_000),
  participation_points: num(0, 1_000),
  difficulty_multipliers: z.object({ easy: num(0, 10), medium: num(0, 10), hard: num(0, 10) }).strict(),
  decay: z.object({ half_life_days: num(0, 3650), floor: num(0, 1) }).strict(),
  min_ranked_entries: z.number().int().min(1).max(1000),
  arena: z.object({ points_per_solve: num(0, 100), max_per_season: num(0, 100_000) }).strict(),
  college_top_k: z.number().int().min(1).max(1000),
  sources: z.object({ contest: z.boolean(), codeathon: z.boolean(), hackathon: z.boolean(), arena: z.boolean() }).strict(),
  team: z.object({ min_size: z.number().int().min(1).max(10), max_size: z.number().int().min(1).max(10) }).strict(),
  badges: z.object({ individual_top_n: z.number().int().min(0).max(100), college_top_n: z.number().int().min(0).max(50), team_top_n: z.number().int().min(0).max(50) }).strict(),
  event_difficulty: z.record(z.string().regex(/^(contest|codeathon|hackathon):[\w-]{1,80}$/), z.enum(['easy', 'medium', 'hard'])),
}).strict()
  .refine((c) => c.team.min_size <= c.team.max_size, { message: 'Team minimum is above the maximum', path: ['team'] })
  .refine((c) => c.beyond_top_min <= c.beyond_top_max, { message: 'Points after the top places must slide down', path: ['beyond_top_min'] })

/** Partial config laid over the defaults (not validated). */
export function overlayConfig(raw: unknown): Record<string, unknown> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<SeasonConfig>
  const d = DEFAULT_SEASON_CONFIG
  return {
    ...d,
    ...r,
    difficulty_multipliers: { ...d.difficulty_multipliers, ...(r.difficulty_multipliers || {}) },
    decay: { ...d.decay, ...(r.decay || {}) },
    arena: { ...d.arena, ...(r.arena || {}) },
    sources: { ...d.sources, ...(r.sources || {}) },
    team: { ...d.team, ...(r.team || {}) },
    badges: { ...d.badges, ...(r.badges || {}) },
    event_difficulty: { ...(r.event_difficulty || {}) },
  }
}

/** Stored / partial config → a valid config (falls back to the defaults if invalid). */
export function mergeConfig(raw: unknown): SeasonConfig {
  const parsed = seasonConfigSchema.safeParse(overlayConfig(raw))
  return parsed.success ? (parsed.data as SeasonConfig) : DEFAULT_SEASON_CONFIG
}

export const seasonInputSchema = z.object({
  name: z.string().trim().min(3).max(120),
  slug: z.string().trim().regex(/^[a-z0-9-]{3,60}$/).optional(),
  starts_at: z.string().refine((s) => Number.isFinite(Date.parse(s)), 'Enter a valid start date'),
  ends_at: z.string().refine((s) => Number.isFinite(Date.parse(s)), 'Enter a valid end date'),
  status: z.enum(['draft', 'published']).optional(),
  config: z.unknown().optional(),
}).strict().refine((s) => Date.parse(s.starts_at) < Date.parse(s.ends_at), { message: 'The season must end after it starts', path: ['ends_at'] })

/** Pure: season phase for display. */
export function seasonPhase(s: Pick<SeasonDoc, 'status' | 'starts_at' | 'ends_at'>, now = new Date()): 'draft' | 'upcoming' | 'live' | 'ended' | 'final' {
  if (s.status === 'draft') return 'draft'
  if (s.status === 'finalized') return 'final'
  const t = now.getTime()
  if (t < Date.parse(s.starts_at)) return 'upcoming'
  if (t > Date.parse(s.ends_at)) return 'ended'
  return 'live'
}

/** Pure: suggested quarterly window (calendar quarter containing `now`). */
export function quarterWindow(now = new Date()): { name: string; starts_at: string; ends_at: string; slug: string } {
  const y = now.getUTCFullYear()
  const q = Math.floor(now.getUTCMonth() / 3)
  const start = new Date(Date.UTC(y, q * 3, 1))
  const end = new Date(Date.UTC(y, q * 3 + 3, 1) - 1)
  return { name: `Q${q + 1} ${y} league`, slug: `q${q + 1}-${y}`, starts_at: start.toISOString(), ends_at: end.toISOString() }
}
