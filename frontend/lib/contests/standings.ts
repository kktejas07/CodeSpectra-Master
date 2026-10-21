/**
 * Contest standings (pure, client-safe): format rescoring (CTF dynamic
 * values, code-golf relative points), aggregation per entry, freezing and
 * ranking with a tie-break. The leaderboard API, the results release and the
 * certificates all use this one function.
 */
import { golfPoints } from './scoring/code'
import { ctfValue } from './scoring/ctf-value'
import { FORMATS } from './formats'
import type { ContestEntryDoc, ContestFormat, ContestPublicConfig, StandingRow, TieBreak } from './types'

export interface StandingSub {
  id: string
  entry_id: string
  task_id: string
  status: string
  score: number | null
  private_score?: number | null
  detail?: Record<string, unknown>
  created_at: string
}

export interface StandingsOptions {
  format: ContestFormat
  config: ContestPublicConfig
  /** Secret task values the rescoring needs (CTF points live in public config). */
  direction: 'desc' | 'asc'
  tieBreak: TieBreak
  /** Count only submissions made before this time (leaderboard freeze). */
  before?: string | null
  /** Datathon final board: private split. */
  usePrivate?: boolean
}

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)

/** Recompute scores that depend on everyone else's submissions. */
export function rescore(subs: StandingSub[], format: ContestFormat, config: ContestPublicConfig): StandingSub[] {
  if (format === 'ctf') {
    // First correct flag per entry per challenge, in time order.
    const firsts = new Map<string, StandingSub>()
    const solves = new Map<string, number>()
    for (const s of [...subs].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      if (s.status !== 'scored' || s.detail?.correct !== true) continue
      const k = `${s.entry_id}|${s.task_id}`
      if (firsts.has(k)) continue
      firsts.set(k, s)
      solves.set(s.task_id, (solves.get(s.task_id) || 0) + 1)
    }
    return subs.map((s) => {
      const first = firsts.get(`${s.entry_id}|${s.task_id}`)
      if (!first || first.id !== s.id) return { ...s, score: s.status === 'scored' ? 0 : s.score }
      const task = config.tasks.find((t) => t.id === s.task_id) || {}
      const init = num((task as Record<string, unknown>).initial_points, 500)
      const min = num((task as Record<string, unknown>).min_points, 100)
      const decay = num((task as Record<string, unknown>).decay_solves, 20)
      return { ...s, score: ctfValue(init, min, decay, solves.get(s.task_id) || 1) }
    })
  }
  if (format === 'code_golf') {
    const best = new Map<string, number>()
    for (const s of subs) {
      if (s.status !== 'scored' || s.detail?.all_passed !== true) continue
      const len = num(s.detail?.length, 0)
      if (len > 0 && (!best.has(s.task_id) || len < best.get(s.task_id)!)) best.set(s.task_id, len)
    }
    return subs.map((s) => {
      if (s.status !== 'scored') return s
      if (s.detail?.all_passed !== true) return { ...s, score: 0 }
      const task = config.tasks.find((t) => t.id === s.task_id) || {}
      return { ...s, score: golfPoints(num(s.detail?.length, 0), best.get(s.task_id) || 0, num((task as Record<string, unknown>).points, 100)) }
    })
  }
  return subs
}

type EntryLike = Pick<ContestEntryDoc, 'id' | 'name' | 'kind' | 'member_ids'>

/** Better score for the direction (ties keep the earlier one). */
function better(a: number, b: number, dir: 'desc' | 'asc'): boolean {
  return dir === 'desc' ? a > b : a < b
}

export function computeStandings(entries: EntryLike[], subsIn: StandingSub[], opts: StandingsOptions): StandingRow[] {
  const meta = FORMATS[opts.format]
  const cutoff = opts.before ? Date.parse(opts.before) : null
  const visible = cutoff === null ? subsIn : subsIn.filter((s) => Date.parse(s.created_at) < cutoff)
  const subs = rescore(visible, opts.format, opts.config).sort((a, b) => a.created_at.localeCompare(b.created_at))
  const dir = opts.direction

  const rows: StandingRow[] = []
  for (const e of entries) {
    const mine = subs.filter((s) => s.entry_id === e.id)
    const attempts = mine.filter((s) => s.status !== 'error').length
    const scored = mine.filter((s) => s.status === 'scored' && typeof s.score === 'number' && Number.isFinite(s.score))
    const row: StandingRow = { entry_id: e.id, name: e.name, kind: e.kind, member_ids: e.member_ids, total: 0, tasks: {}, solved: 0, attempts, reached_at: null, rank: null, tied: false }
    if (scored.length === 0) { rows.push(row); continue }

    if (meta.judged) {
      // Judges score the latest submission.
      const last = scored[scored.length - 1]
      row.total = last.score as number
      row.tasks[last.task_id] = row.total
      row.reached_at = last.created_at
    } else if (meta.aggregate === 'best') {
      let pick = scored[0]
      for (const s of scored) if (better(s.score as number, pick.score as number, dir)) pick = s
      const value = opts.usePrivate && typeof pick.private_score === 'number' ? pick.private_score : (pick.score as number)
      row.total = value
      row.tasks[pick.task_id] = value
      row.reached_at = pick.created_at
    } else if (meta.aggregate === 'sum_all') {
      for (const s of scored) {
        row.total += s.score as number
        row.tasks[s.task_id] = (row.tasks[s.task_id] || 0) + (s.score as number)
      }
      row.reached_at = scored[scored.length - 1].created_at
    } else {
      const bestByTask = new Map<string, StandingSub>()
      for (const s of scored) {
        const cur = bestByTask.get(s.task_id)
        if (!cur || (s.score as number) > (cur.score as number)) bestByTask.set(s.task_id, s)
      }
      let reached = ''
      for (const [tid, s] of bestByTask) {
        row.tasks[tid] = s.score as number
        row.total += s.score as number
        if ((s.score as number) > 0 && s.created_at > reached) reached = s.created_at
      }
      row.reached_at = reached || null
    }
    row.total = Math.round(row.total * 1e6) / 1e6
    row.solved = Object.values(row.tasks).filter((v) => v > 0).length
    rows.push(row)
  }
  return rankRows(rows, dir, opts.tieBreak)
}

/** Competition ranking ("1224") on total, then the tie-break. Unscored rows get no rank. */
export function rankRows(rows: StandingRow[], dir: 'desc' | 'asc', tieBreak: TieBreak): StandingRow[] {
  const ranked = rows.filter((r) => r.reached_at !== null || r.total !== 0 || Object.keys(r.tasks).length > 0)
  const unranked = rows.filter((r) => !ranked.includes(r))
  const t = (r: StandingRow) => (r.reached_at ? Date.parse(r.reached_at) : Number.MAX_SAFE_INTEGER)
  const cmp = (a: StandingRow, b: StandingRow) => {
    if (a.total !== b.total) return dir === 'desc' ? b.total - a.total : a.total - b.total
    if (tieBreak === 'fewest_attempts' && a.attempts !== b.attempts) return a.attempts - b.attempts
    return t(a) - t(b)
  }
  ranked.sort(cmp)
  let prev: StandingRow | null = null
  ranked.forEach((r, i) => {
    r.rank = prev && cmp(prev, r) === 0 ? prev.rank : i + 1
    prev = r
  })
  for (let i = 0; i < ranked.length; i++) {
    const r = ranked[i]
    r.tied = ranked.some((o, j) => j !== i && o.rank === r.rank)
  }
  unranked.sort((a, b) => a.name.localeCompare(b.name))
  return [...ranked, ...unranked]
}

/** Start of the freeze window, or null when the board is not frozen now. */
export function freezeStart(endsAt: string, freezeMinutes: number, now = Date.now()): string | null {
  if (!(freezeMinutes > 0)) return null
  const end = Date.parse(endsAt)
  const start = end - freezeMinutes * 60_000
  return now >= start ? new Date(start).toISOString() : null
}
