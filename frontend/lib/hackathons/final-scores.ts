/**
 * Final judged scores + team ranking for hackathons. Pure, client-safe.
 *
 * Per submission (0–100 scale):
 *   human  = mean of one total per judge (rubric entry wins over a simple
 *            score; a judge's later entry replaces their earlier one),
 *            trimmed high/low when judging_config.dropHighLow is on
 *   final  = blend(AI screening total, human, aiWeight)
 *            — or the auto-grade percentage when nobody judged it
 * Team total = sum over problems of the best final per problem, weighted by
 * that problem's points (final% × max_score). Teams are ranked on that total
 * with standard competition ranking; XP is never used.
 */
import { average, blendFinal } from './calibration'
import { rankByScore } from './ranking'
import { normalizeSubmissionStatus } from './submission-state'
import type { JudgingConfig } from './judge-config'

type Rec = Record<string, unknown>

function finite(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function r1(n: number): number {
  return Math.round(n * 10) / 10
}

/** One human total per judge for a submission doc. */
export function judgeTotals(sub: Rec): number[] {
  const byJudge = new Map<string, number>()
  const simple = Array.isArray(sub.scores) ? sub.scores : []
  for (const e of simple) {
    if (!e || typeof e !== 'object') continue
    const j = typeof (e as Rec).judge_id === 'string' ? ((e as Rec).judge_id as string) : ''
    const t = finite((e as Rec).score)
    if (j && t !== null) byJudge.set(j, t)
  }
  const rubric = Array.isArray(sub.rubric_scores) ? sub.rubric_scores : []
  for (const e of rubric) {
    if (!e || typeof e !== 'object') continue
    const j = typeof (e as Rec).judge_id === 'string' ? ((e as Rec).judge_id as string) : ''
    const t = finite((e as Rec).total_score)
    if (j && t !== null) byJudge.set(j, t)
  }
  return [...byJudge.values()]
}

/**
 * Auto-grade score as a 0–100 percentage, or null when there is none.
 * Only used when no judge scored the submission; older auto-graded docs
 * carry just `score` (in task points), so that counts too.
 */
export function autoPercent(sub: Rec): number | null {
  const score = finite(sub.auto_score ?? sub.score)
  const max = finite(sub.max_score)
  if (score === null) return null
  if (max === null || max <= 0) return Math.max(0, Math.min(100, score))
  return Math.max(0, Math.min(100, (score / max) * 100))
}

export interface SubmissionFinal {
  human_avg: number | null
  human_count: number
  ai_total: number | null
  /** 0–100, null when nothing scored it. */
  final_score: number | null
  /** final_score scaled to the problem's points. */
  final_points: number | null
}

export function computeSubmissionFinal(
  sub: Rec,
  aiTotal: number | null | undefined,
  cfg: Pick<JudgingConfig, 'aiWeight' | 'dropHighLow'>,
): SubmissionFinal {
  const totals = judgeTotals(sub)
  const humanAvg = average(totals, { dropHighLow: cfg.dropHighLow })
  const ai = finite(aiTotal)
  let final = humanAvg !== null || ai !== null ? blendFinal(ai, humanAvg, cfg.aiWeight) : null
  if (final === null) final = autoPercent(sub)
  if (final !== null) final = r1(Math.max(0, Math.min(100, final)))
  const max = finite(sub.max_score)
  const points = final === null ? null : max !== null && max > 0 ? r1((final / 100) * max) : final
  return { human_avg: humanAvg, human_count: totals.length, ai_total: ai, final_score: final, final_points: points }
}

export interface TeamStanding {
  team_id: string
  total: number | null
  problems_scored: number
  rank: number | null
  tied: boolean
  advancing: boolean
}

/**
 * Rank teams from per-submission final points. Rejected submissions never
 * count. `subs` must carry `final_points` (as stored at release) or be
 * pre-computed by the caller.
 */
export function rankTeams(
  teamIds: readonly string[],
  subs: ReadonlyArray<{ team_id?: unknown; problem_slug?: unknown; status?: unknown; final_points?: unknown }>,
  cfg: Pick<JudgingConfig, 'advanceTopN'>,
): TeamStanding[] {
  const best = new Map<string, Map<string, number>>()
  for (const s of subs) {
    const team = typeof s.team_id === 'string' ? s.team_id : ''
    const prob = typeof s.problem_slug === 'string' ? s.problem_slug : ''
    const pts = finite(s.final_points)
    if (!team || pts === null) continue
    if (normalizeSubmissionStatus(s.status) === 'rejected') continue
    const m = best.get(team) || new Map<string, number>()
    if (!m.has(prob) || (m.get(prob) as number) < pts) m.set(prob, pts)
    best.set(team, m)
  }
  const rows = teamIds.map((id) => {
    const m = best.get(id)
    const total = m && m.size > 0 ? r1([...m.values()].reduce((a, b) => a + b, 0)) : null
    return { team_id: id, total, problems_scored: m ? m.size : 0 }
  })
  const ranks = rankByScore(rows, (r) => r.team_id, (r) => r.total)
  const topN = Math.max(1, Math.floor(cfg.advanceTopN || 0) || 1)
  const out: TeamStanding[] = rows.map((r) => {
    const info = ranks.get(r.team_id)
    return {
      ...r,
      rank: info ? info.rank : null,
      tied: info ? info.tied : false,
      advancing: !!info && info.rank <= topN,
    }
  })
  out.sort((a, b) => {
    if (a.rank === null && b.rank === null) return 0
    if (a.rank === null) return 1
    if (b.rank === null) return -1
    return a.rank - b.rank
  })
  return out
}

/**
 * Server-side rubric total on a 0–100 scale. Each criterion score is clamped
 * to 0..weight of the matching configured criterion (unknown names are
 * ignored) and the sum is rescaled when the weights don't add up to 100.
 * The client's `total_score` is never trusted.
 */
export function rubricTotal(
  given: ReadonlyArray<{ name?: unknown; score?: unknown }> | null | undefined,
  criteria: ReadonlyArray<{ name: string; weight: number }> | null | undefined,
): number | null {
  const conf = (criteria || []).filter((c) => c && typeof c.name === 'string' && finite(c.weight) !== null && c.weight > 0)
  const weightSum = conf.reduce((a, c) => a + c.weight, 0)
  if (!Array.isArray(given) || conf.length === 0 || weightSum <= 0) return null
  let sum = 0
  for (const c of conf) {
    const g = given.find((x) => x && x.name === c.name)
    const v = finite(g?.score)
    if (v !== null) sum += Math.max(0, Math.min(c.weight, v))
  }
  return Math.round((sum / weightSum) * 100)
}

/**
 * Submissions released before final scores were stored carry no
 * `final_points`; derive them (judges + auto-grade, no AI) so older events
 * still rank. Docs that have it are returned as-is.
 */
export function withFinalPoints<T extends Rec>(subs: readonly T[], cfg: Pick<JudgingConfig, 'aiWeight' | 'dropHighLow'>): Array<T & { final_points: number | null }> {
  return subs.map((s) => {
    const fp = finite(s.final_points)
    if (fp !== null) return { ...s, final_points: fp }
    return { ...s, final_points: computeSubmissionFinal(s, null, cfg).final_points }
  })
}
