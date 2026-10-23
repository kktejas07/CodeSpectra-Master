/**
 * Hiring sourcer loop — selection logic (pure). Which open jobs to source
 * tonight, and which best-match learners to put on the invite shortlist.
 */
import type { SourcerParams } from './types'

export interface InviteCounts { pending: number; accepted: number; declined: number; expired: number; withdrawn: number }

export interface SourcerJobState {
  id: string
  title: string
  status: string
  openings: number
  /** Last time the loop proposed invites for this job. */
  last_sourced_at?: string | null
  /** Active applications created in the last `stall_days`. */
  recent_applications: number
  hired: number
  invites: InviteCounts
}

export type SourceMode = 'first' | 'stalled' | 'top_up'

export interface JobToSource { id: string; title: string; mode: SourceMode; min_match: number; limit: number }

const DAY = 86_400_000
const ORDER: Record<SourceMode, number> = { first: 0, stalled: 1, top_up: 2 }

/**
 * The funnel stalled: invites went out at least `stall_days` ago, nobody
 * accepted, nobody new applied and nothing is still pending. Pure.
 */
export function funnelStalled(j: Pick<SourcerJobState, 'last_sourced_at' | 'recent_applications' | 'invites'>, now: Date, stallDays: number): boolean {
  if (!j.last_sourced_at) return false
  const age = now.getTime() - Date.parse(j.last_sourced_at)
  if (!(age >= stallDays * DAY)) return false
  const sent = j.invites.pending + j.invites.accepted + j.invites.declined + j.invites.expired
  return sent > 0 && j.invites.accepted === 0 && j.invites.pending === 0 && j.recent_applications === 0
}

/** Jobs to source now, most urgent first, at most `max_jobs`. Pure. */
export function jobsToSource(jobs: readonly SourcerJobState[], now: Date, p: SourcerParams): JobToSource[] {
  const out: (JobToSource & { since: number })[] = []
  for (const j of jobs) {
    if (j.status !== 'open') continue
    if (j.openings > 0 && j.hired >= j.openings) continue
    const since = j.last_sourced_at ? now.getTime() - Date.parse(j.last_sourced_at) : Infinity
    // Never twice within a day.
    if (since < 20 * 3_600_000) continue
    let mode: SourceMode | null = null
    if (!j.last_sourced_at) mode = 'first'
    else if (funnelStalled(j, now, p.stall_days)) mode = 'stalled'
    else if (j.invites.pending === 0 && j.invites.accepted < p.invites_per_job && since >= 3 * DAY) mode = 'top_up'
    if (!mode) continue
    const min_match = mode === 'stalled' ? Math.max(0, p.min_match - 10) : p.min_match
    const limit = mode === 'top_up' ? Math.max(1, Math.ceil(p.invites_per_job / 2)) : p.invites_per_job
    out.push({ id: j.id, title: j.title, mode, min_match, limit, since })
  }
  out.sort((a, b) => ORDER[a.mode] - ORDER[b.mode] || b.since - a.since)
  return out.slice(0, p.max_jobs).map(({ since: _s, ...rest }) => rest)
}

export interface MatchCandidate {
  handle: string
  name: string
  availability: string | null
  match: { score: number; matched: { skill: string }[]; missing: string[] }
}

export interface ShortlistPick { handle: string; name: string; score: number; matched: string[]; missing: string[] }

const AVAIL_RANK: Record<string, number> = { immediately: 0, within_1_month: 1, within_3_months: 2 }

/**
 * Best matches → invite shortlist: at or above `minMatch`, not already
 * invited (any status) and not "not looking"; best score first, then sooner
 * availability, then more verified skills. Pure.
 */
export function pickShortlist(cands: readonly MatchCandidate[], exclude: ReadonlySet<string>, minMatch: number, limit: number): ShortlistPick[] {
  const seen = new Set<string>()
  return cands
    .filter((c) => c.handle && !exclude.has(c.handle) && c.availability !== 'not_looking' && c.match.score >= minMatch)
    .filter((c) => (seen.has(c.handle) ? false : (seen.add(c.handle), true)))
    .sort((a, b) => b.match.score - a.match.score
      || (AVAIL_RANK[a.availability ?? ''] ?? 3) - (AVAIL_RANK[b.availability ?? ''] ?? 3)
      || b.match.matched.length - a.match.matched.length)
    .slice(0, Math.max(0, limit))
    .map((c) => ({ handle: c.handle, name: c.name, score: Math.round(c.match.score), matched: c.match.matched.map((m) => m.skill).slice(0, 6), missing: c.match.missing.slice(0, 4) }))
}

/** Tally invite statuses (an expired-but-pending invite counts as expired). Pure. */
export function countInvites(rows: readonly { status: string; expires_at: string }[], now: Date): InviteCounts {
  const c: InviteCounts = { pending: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0 }
  for (const r of rows) {
    const s = r.status === 'pending' && Date.parse(r.expires_at) < now.getTime() ? 'expired' : r.status
    if (s in c) c[s as keyof InviteCounts]++
  }
  return c
}
