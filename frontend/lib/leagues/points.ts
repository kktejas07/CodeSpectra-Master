/**
 * League points table (pure, unit tested).
 *
 * Per event entry (a person or a team in one released contest / codeathon /
 * hackathon inside the season window):
 *   base   = placement points for its rank (top places from the table, then a
 *            linear slide down to `beyond_top_min` at last place) — or 0 when
 *            unranked or the event had fewer than `min_ranked_entries`
 *   points = (base + participation) × difficulty multiplier × decay weight
 * Every member of a team entry gets the entry's points (teams share a result).
 * Arena: points_per_solve per solve, capped per season.
 *
 * Boards:
 *   individual  sum per user, ranked with the leaderboard's competition ranking
 *   college     sum of each college's best `college_top_k` students
 *   team        per event the team takes its best member's points (so a team
 *               of five doesn't score five times for one result), plus members' arena points
 */
import { assignRanks } from '@/lib/leaderboard-calc'
import type { Difficulty, EventKind, SeasonConfig } from './types'

export interface LeagueEventEntry { member_ids: string[]; rank: number | null }
export interface LeagueEvent {
  key: string
  kind: EventKind
  title: string
  ended_at: string
  difficulty: Difficulty
  /** Ranked entries (for the slide and the minimum-size rule). */
  ranked: number
  entries: LeagueEventEntry[]
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function placementPoints(rank: number | null, ranked: number, cfg: Pick<SeasonConfig, 'placement_points' | 'beyond_top_max' | 'beyond_top_min' | 'min_ranked_entries'>): number {
  if (!rank || !Number.isFinite(rank) || rank < 1 || ranked < cfg.min_ranked_entries) return 0
  const table = cfg.placement_points
  if (rank <= table.length) return table[rank - 1] ?? 0
  const span = ranked - table.length
  if (span <= 1) return cfg.beyond_top_max
  const t = Math.min(1, (rank - table.length - 1) / (span - 1))
  return cfg.beyond_top_max - (cfg.beyond_top_max - cfg.beyond_top_min) * t
}

export function decayWeight(endedAt: string, ref: Date, cfg: Pick<SeasonConfig, 'decay'>): number {
  const hl = cfg.decay.half_life_days
  if (!hl || hl <= 0) return 1
  const ageDays = Math.max(0, (ref.getTime() - Date.parse(endedAt)) / 86_400_000)
  if (!Number.isFinite(ageDays)) return 1
  return Math.max(cfg.decay.floor, Math.pow(0.5, ageDays / hl))
}

export function eventDifficulty(e: Pick<LeagueEvent, 'key' | 'difficulty'>, cfg: Pick<SeasonConfig, 'event_difficulty'>): Difficulty {
  return cfg.event_difficulty[e.key] ?? e.difficulty
}

/** Points per user for one event (team entries credit every member). */
export function eventPoints(e: LeagueEvent, cfg: SeasonConfig, ref: Date): Map<string, number> {
  const out = new Map<string, number>()
  if (!cfg.sources[e.kind]) return out
  const mult = cfg.difficulty_multipliers[eventDifficulty(e, cfg)] ?? 1
  const w = decayWeight(e.ended_at, ref, cfg)
  for (const en of e.entries) {
    const pts = (placementPoints(en.rank, e.ranked, cfg) + cfg.participation_points) * mult * w
    for (const m of new Set(en.member_ids)) {
      if (!m) continue
      out.set(m, Math.max(out.get(m) ?? 0, pts))
    }
  }
  return out
}

export interface UserLedger {
  /** event key → points */
  events: Map<string, number>
  arena: number
  best_rank: number | null
}

/** Per-user ledger across the season. */
export function buildLedger(events: readonly LeagueEvent[], arenaSolves: ReadonlyMap<string, number>, cfg: SeasonConfig, ref: Date): Map<string, UserLedger> {
  const out = new Map<string, UserLedger>()
  const get = (u: string) => {
    let l = out.get(u)
    if (!l) { l = { events: new Map(), arena: 0, best_rank: null }; out.set(u, l) }
    return l
  }
  for (const e of events) {
    for (const [u, p] of eventPoints(e, cfg, ref)) get(u).events.set(e.key, p)
    if (!cfg.sources[e.kind]) continue
    for (const en of e.entries) {
      if (!en.rank) continue
      for (const m of en.member_ids) {
        const l = get(m)
        if (l.best_rank === null || en.rank < l.best_rank) l.best_rank = en.rank
      }
    }
  }
  if (cfg.sources.arena) {
    for (const [u, n] of arenaSolves) {
      if (!(n > 0)) continue
      get(u).arena = Math.min(cfg.arena.max_per_season, n * cfg.arena.points_per_solve)
    }
  }
  return out
}

export const ledgerTotal = (l: UserLedger) => [...l.events.values()].reduce((a, b) => a + b, 0) + l.arena

export interface IndividualRow { rank: number; user_id: string; points: number; events: number; best_rank: number | null; college_id: string | null }

export function individualBoard(ledger: ReadonlyMap<string, UserLedger>, collegeOf: ReadonlyMap<string, string>): IndividualRow[] {
  const rows = [...ledger.entries()].map(([userId, l]) => ({ userId, xp: round1(ledgerTotal(l)), l }))
  return assignRanks(rows).map((r) => ({ rank: r.rank, user_id: r.userId, points: r.xp, events: r.l.events.size, best_rank: r.l.best_rank, college_id: collegeOf.get(r.userId) ?? null }))
}

export interface CollegeRow { rank: number; college_id: string; points: number; scoring_students: number; students: number }

export function collegeBoard(individual: readonly IndividualRow[], cfg: Pick<SeasonConfig, 'college_top_k'>): CollegeRow[] {
  const by = new Map<string, number[]>()
  for (const r of individual) {
    if (!r.college_id) continue
    const list = by.get(r.college_id) ?? []
    list.push(r.points)
    by.set(r.college_id, list)
  }
  const rows = [...by.entries()].map(([college_id, pts]) => {
    const top = [...pts].sort((a, b) => b - a).slice(0, cfg.college_top_k)
    return { userId: college_id, xp: round1(top.reduce((a, b) => a + b, 0)), scoring: top.length, students: pts.length }
  })
  return assignRanks(rows).map((r) => ({ rank: r.rank, college_id: r.userId, points: r.xp, scoring_students: r.scoring, students: r.students }))
}

export interface TeamRow { rank: number; team_id: string; points: number; events: number }

export function teamBoard(teams: ReadonlyArray<{ id: string; member_ids: string[] }>, ledger: ReadonlyMap<string, UserLedger>): TeamRow[] {
  const rows = teams.map((t) => {
    const best = new Map<string, number>()
    let arena = 0
    for (const m of new Set(t.member_ids)) {
      const l = ledger.get(m)
      if (!l) continue
      arena += l.arena
      for (const [k, p] of l.events) best.set(k, Math.max(best.get(k) ?? 0, p))
    }
    const total = [...best.values()].reduce((a, b) => a + b, 0) + arena
    return { userId: t.id, xp: round1(total), events: best.size }
  })
  return assignRanks(rows).map((r) => ({ rank: r.rank, team_id: r.userId, points: r.xp, events: r.events }))
}

export interface BadgeAward { subject: 'user' | 'college' | 'team'; subject_id: string; rank: number; badge: 'champion' | 'runner_up' | 'third' | 'top_n'; label: string }

function badgeFor(rank: number, n: number, what: string): Pick<BadgeAward, 'badge' | 'label'> {
  if (rank === 1) return { badge: 'champion', label: `${what} champion` }
  if (rank === 2) return { badge: 'runner_up', label: `${what} runner-up` }
  if (rank === 3) return { badge: 'third', label: `${what} third place` }
  return { badge: 'top_n', label: `${what} top ${n}` }
}

/** Season-end badges: top N of each board (ties share the badge). */
export function seasonBadges(boards: { individual: readonly IndividualRow[]; colleges: readonly CollegeRow[]; teams: readonly TeamRow[] }, cfg: Pick<SeasonConfig, 'badges'>): BadgeAward[] {
  const out: BadgeAward[] = []
  for (const r of boards.individual) if (r.rank <= cfg.badges.individual_top_n) out.push({ subject: 'user', subject_id: r.user_id, rank: r.rank, ...badgeFor(r.rank, cfg.badges.individual_top_n, 'League') })
  for (const r of boards.colleges) if (r.rank <= cfg.badges.college_top_n) out.push({ subject: 'college', subject_id: r.college_id, rank: r.rank, ...badgeFor(r.rank, cfg.badges.college_top_n, 'College league') })
  for (const r of boards.teams) if (r.rank <= cfg.badges.team_top_n) out.push({ subject: 'team', subject_id: r.team_id, rank: r.rank, ...badgeFor(r.rank, cfg.badges.team_top_n, 'Team league') })
  return out
}

/** Public display name: first name + last initial ("Priya S."); never an email. */
export function maskedName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (!s || s.includes('@')) return 'Participant'
  const parts = s.split(/\s+/).filter(Boolean)
  const first = parts[0].slice(0, 30)
  return parts.length > 1 ? `${first} ${parts[parts.length - 1][0].toUpperCase()}.` : first
}
