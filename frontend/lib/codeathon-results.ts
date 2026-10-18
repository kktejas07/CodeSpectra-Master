/**
 * Codeathon results release — pure, client-safe rules (no I/O).
 *
 * Standings are rebuilt from submissions at release time (never from the
 * running leaderboard counters): best score per problem, summed, per entrant
 * (the user in individual mode, the team in team mode). Rejected and
 * still-running submissions never count. Entrants with a positive total are
 * ranked with standard competition ranking ("1224"); everyone else who
 * submitted is listed unranked and can still get a participation certificate.
 */
import { rankByScore } from '@/lib/hackathons/ranking'

/** Best score per problem, summed — resubmitting the same solution never inflates the total. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function bestScoreTotals(subs: ReadonlyArray<Record<string, any>>): { total: number; solved: number } {
  const best = new Map<string, { score: number; accepted: boolean }>()
  for (const s of subs) {
    const pid = typeof s.problem_id === 'string' ? s.problem_id : ''
    if (!pid) continue
    const score = typeof s.score === 'number' && Number.isFinite(s.score) ? s.score : 0
    const accepted = s.status === 'accepted'
    const prev = best.get(pid)
    best.set(pid, { score: Math.max(prev?.score ?? 0, score), accepted: !!prev?.accepted || accepted })
  }
  let total = 0
  let solved = 0
  for (const v of best.values()) { total += v.score; if (v.accepted) solved++ }
  return { total, solved }
}

// ─── Certificate policy ──────────────────────────────────────────────────────

/** Who gets a certificate: everyone who took part, only the top N, or nobody. */
export type CertificateAudience = 'all' | 'top_n' | 'none'

export interface CertificatePolicy {
  audience: CertificateAudience
  /** Places 1..top_n get rank wording ("1st place"); the rest get participation wording. */
  top_n: number
}

export const DEFAULT_CERTIFICATE_POLICY: CertificatePolicy = { audience: 'all', top_n: 3 }
export const MAX_TOP_N = 100

export function sanitizeCertificatePolicy(raw: unknown): CertificatePolicy {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const audience: CertificateAudience = r.audience === 'top_n' || r.audience === 'none' ? r.audience : 'all'
  const n = Math.floor(Number(r.top_n))
  const top_n = Number.isFinite(n) ? Math.min(MAX_TOP_N, Math.max(1, n)) : DEFAULT_CERTIFICATE_POLICY.top_n
  return { audience, top_n }
}

// ─── Standings ───────────────────────────────────────────────────────────────

export interface CodeathonSubmissionLike {
  user_id?: unknown
  team_id?: unknown
  problem_id?: unknown
  score?: unknown
  status?: unknown
}

export interface CodeathonEntrantInfo {
  /** user id (individual) or team id (team mode). */
  entrant_id: string
  kind: 'user' | 'team'
  name: string
  member_ids: string[]
  member_names?: string[]
}

export interface CodeathonStanding extends CodeathonEntrantInfo {
  total_score: number
  problems_solved: number
  rank: number | null
  tied: boolean
}

/** Statuses that still need grading or a judge decision. */
const PENDING_STATUSES = new Set(['running', 'pending', 'under_review', 'queued'])

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Submissions that never count towards a total (judge-rejected, or never finished grading). */
export function countsTowardsScore(s: CodeathonSubmissionLike): boolean {
  const st = str(s.status).toLowerCase()
  return st !== 'rejected' && !PENDING_STATUSES.has(st)
}

/** Submissions still waiting for a grade or review (shown as a warning before release). */
export function countUnscored(subs: ReadonlyArray<CodeathonSubmissionLike>): number {
  return subs.filter((s) => PENDING_STATUSES.has(str(s.status).toLowerCase())).length
}

/** Entrant key for a submission: team id in team mode, user id otherwise. */
export function entrantKey(s: CodeathonSubmissionLike, teamMode: boolean): string {
  return teamMode ? str(s.team_id) : str(s.user_id)
}

/**
 * Build the final standings. `entrants` supplies names / members for every
 * key that may appear; a key with submissions but no entrant info still gets
 * a row (name "Participant") so nobody silently disappears.
 */
export function computeCodeathonStandings(
  subs: ReadonlyArray<CodeathonSubmissionLike>,
  entrants: ReadonlyMap<string, CodeathonEntrantInfo>,
  teamMode: boolean,
): CodeathonStanding[] {
  const byEntrant = new Map<string, Array<Record<string, unknown>>>()
  for (const s of subs) {
    const key = entrantKey(s, teamMode)
    if (!key) continue
    const list = byEntrant.get(key) || []
    // Non-counting submissions still make the entrant a participant, at 0 points.
    list.push(countsTowardsScore(s) ? (s as Record<string, unknown>) : { ...(s as Record<string, unknown>), score: 0, status: 'excluded' })
    byEntrant.set(key, list)
  }

  const rows = [...byEntrant.entries()].map(([key, list]) => {
    const t = bestScoreTotals(list)
    const info = entrants.get(key)
    const base: CodeathonEntrantInfo = info || {
      entrant_id: key,
      kind: teamMode ? 'team' : 'user',
      name: teamMode ? 'Team' : 'Participant',
      member_ids: teamMode ? [] : [key],
    }
    return { ...base, entrant_id: key, total_score: t.total, problems_solved: t.solved }
  })

  const ranks = rankByScore(rows, (r) => r.entrant_id, (r) => (r.total_score > 0 ? r.total_score : null))
  const out: CodeathonStanding[] = rows.map((r) => {
    const info = ranks.get(r.entrant_id)
    return { ...r, rank: info ? info.rank : null, tied: info ? info.tied : false }
  })
  out.sort((a, b) => {
    if (a.rank !== null && b.rank !== null && a.rank !== b.rank) return a.rank - b.rank
    if (a.rank === null && b.rank !== null) return 1
    if (a.rank !== null && b.rank === null) return -1
    return a.name.localeCompare(b.name)
  })
  return out
}

// ─── Certificates ────────────────────────────────────────────────────────────

export type CodeathonCertificateKind = 'rank' | 'participation'

/** Which certificate (if any) a standing earns under the policy. */
export function certificateKindFor(standing: Pick<CodeathonStanding, 'rank'>, policy: CertificatePolicy): CodeathonCertificateKind | null {
  if (policy.audience === 'none') return null
  if (standing.rank !== null && standing.rank <= policy.top_n) return 'rank'
  return policy.audience === 'all' ? 'participation' : null
}

export function ordinal(n: number): string {
  const v = Math.abs(Math.floor(n))
  const mod100 = v % 100
  if (mod100 >= 11 && mod100 <= 13) return `${v}th`
  switch (v % 10) {
    case 1: return `${v}st`
    case 2: return `${v}nd`
    case 3: return `${v}rd`
    default: return `${v}th`
  }
}

/**
 * Certificate wording. `level` is the line under the title on the
 * certificate / verify page; `scoreLabel` replaces the score line (no "%",
 * so the verify page shows no score band).
 */
export function codeathonCertificateWording(
  kind: CodeathonCertificateKind,
  standing: Pick<CodeathonStanding, 'rank' | 'tied'>,
  rankedCount: number,
): { level: string; scoreLabel: string } {
  if (kind === 'rank' && standing.rank !== null) {
    const tied = standing.tied ? ' (tied)' : ''
    return {
      level: `${ordinal(standing.rank)} place${tied}`,
      scoreLabel: `Ranked #${standing.rank}${tied} of ${rankedCount}`,
    }
  }
  return { level: 'Participant', scoreLabel: 'Certificate of participation' }
}

// ─── Release guard rails ─────────────────────────────────────────────────────

export interface ReleaseCheck {
  ended: boolean
  unscored: number
  entrants: number
}

/** Reasons the organiser must confirm before releasing (empty = safe to release). */
export function releaseWarnings(c: ReleaseCheck): string[] {
  const out: string[] = []
  if (!c.ended) out.push('The codeathon has not ended yet. Releasing now ends it and participants can no longer submit.')
  if (c.unscored > 0) {
    out.push(`${c.unscored} submission${c.unscored === 1 ? ' is' : 's are'} still being graded or reviewed and will count as 0.`)
  }
  if (c.entrants === 0) out.push('Nobody has submitted yet, so there are no results to publish.')
  return out
}

/** XP for a final total — awarded once per member at release. */
export function releaseXp(total: number): number {
  return Number.isFinite(total) && total > 0 ? Math.round(total) : 0
}

/** Public display name: never an email address. */
export function publicName(raw: unknown, fallback = 'Participant'): string {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (!s || s.includes('@')) return fallback
  return s.slice(0, 120)
}
