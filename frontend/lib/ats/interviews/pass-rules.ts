/**
 * Panel decision from interviewer scorecards (pure; tests/ats-interviews.test.ts).
 *
 *  - all_yes:      every submitted recommendation is yes / strong_yes
 *  - majority_yes: more than half of the submitted recommendations are yes / strong_yes
 *  - avg_score:    mean rating (1–5, over all criteria of all scorecards) ≥ pass_score
 *                  (default 3.5)
 * Score (0–100) = mean rating mapped 1→0 … 5→100; with no ratings it falls back
 * to the recommendations (strong_yes 100, yes 75, no 25, strong_no 0).
 */
import type { AtsInterview, ScorecardTemplate } from '@/lib/ats/contract'

export type Scorecard = AtsInterview['scorecards'][number]
export type Recommendation = Scorecard['recommendation']
export type PassRule = 'all_yes' | 'majority_yes' | 'avg_score'

export const RECOMMENDATIONS: readonly Recommendation[] = ['strong_yes', 'yes', 'no', 'strong_no']
export const DEFAULT_AVG_PASS = 3.5

const REC_SCORE: Record<Recommendation, number> = { strong_yes: 100, yes: 75, no: 25, strong_no: 0 }
const isYes = (r: Recommendation) => r === 'yes' || r === 'strong_yes'

export interface PanelDecision {
  outcome: 'pass' | 'fail'
  score: number
  avgRating: number | null
  yes: number
  no: number
  summary: string
}

export function averageRating(cards: Scorecard[]): number | null {
  const all = cards.flatMap((c) => Object.values(c.ratings || {}).filter((n) => Number.isFinite(n) && n >= 1 && n <= 5))
  if (!all.length) return null
  return all.reduce((a, b) => a + b, 0) / all.length
}

export function decidePanel(cards: Scorecard[], rule: PassRule, passScore?: number | null): PanelDecision | null {
  if (!cards.length) return null
  const yes = cards.filter((c) => isYes(c.recommendation)).length
  const no = cards.length - yes
  const avg = averageRating(cards)
  const score = avg !== null
    ? Math.round(((avg - 1) / 4) * 100)
    : Math.round(cards.reduce((a, c) => a + REC_SCORE[c.recommendation], 0) / cards.length)

  let pass: boolean
  let why: string
  switch (rule) {
    case 'all_yes':
      pass = no === 0
      why = pass ? 'every interviewer said yes' : `${no} of ${cards.length} said no`
      break
    case 'majority_yes':
      pass = yes * 2 > cards.length
      why = `${yes} of ${cards.length} said yes`
      break
    case 'avg_score': {
      const need = passScore && passScore >= 1 && passScore <= 5 ? passScore : DEFAULT_AVG_PASS
      pass = avg !== null && avg >= need
      why = avg === null ? 'no ratings given' : `average ${avg.toFixed(2)} vs ${need} needed`
      break
    }
    default:
      pass = false
      why = 'unknown pass rule'
  }
  return {
    outcome: pass ? 'pass' : 'fail',
    score,
    avgRating: avg,
    yes,
    no,
    summary: `Panel ${pass ? 'passed' : 'did not pass'}: ${why} (${cards.length} scorecard${cards.length === 1 ? '' : 's'}).`,
  }
}

/** Validate a submitted scorecard against the stage template. */
export function parseScorecard(
  body: unknown,
  template: ScorecardTemplate,
): { ok: true; ratings: Record<string, number>; recommendation: Recommendation; notes: string } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>
  const rec = b.recommendation
  if (typeof rec !== 'string' || !(RECOMMENDATIONS as readonly string[]).includes(rec)) {
    return { ok: false, error: 'Pick a recommendation.' }
  }
  const raw = (b.ratings && typeof b.ratings === 'object' && !Array.isArray(b.ratings) ? b.ratings : {}) as Record<string, unknown>
  const ratings: Record<string, number> = {}
  for (const c of template.criteria || []) {
    const n = Number(raw[c.id])
    if (!Number.isInteger(n) || n < 1 || n > 5) return { ok: false, error: `Rate "${c.label}" from 1 to 5.` }
    ratings[c.id] = n
  }
  const notes = typeof b.notes === 'string' ? b.notes.trim().slice(0, 5000) : ''
  return { ok: true, ratings, recommendation: rec as Recommendation, notes }
}
