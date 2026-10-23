/**
 * Integrity reviewer loop — case triage (pure). Joins trust scores, similar
 * code clusters and AI-written signals per candidate, ranks a review queue
 * and recommends hold / release-hold for a human. Signals only: no verdicts,
 * and the evidence summary is written in neutral terms.
 */
import type { IntegrityParams } from './types'

export type AiLevel = 'none' | 'low' | 'medium' | 'high'
export type ReviewStatus = 'unreviewed' | 'reviewed' | 'cleared' | 'flagged'

export interface CaseInput {
  user_id: string
  name: string
  attempt_id: string | null
  trust: { score: number; band: 'clear' | 'review' | 'flag'; incidents: number; top: string[] } | null
  review: ReviewStatus
  similarity: { max_score: number; cluster_size: number; question: string; reviewed: boolean } | null
  ai: { level: AiLevel; labels: string[] } | null
  released: boolean
  held: boolean
}

export interface RankedCase extends CaseInput { priority: number; recommendation: 'hold' | 'release_hold' | 'none' }

const AI_WEIGHT: Record<AiLevel, number> = { none: 0, low: 6, medium: 14, high: 22 }

/** 0–100: how much this case needs a reviewer. Cleared cases are 0. Pure. */
export function priority(c: CaseInput): number {
  if (c.review === 'cleared') return 0
  const trust = c.trust ? Math.max(0, 100 - c.trust.score) * 0.5 : 0
  const sim = c.similarity && !c.similarity.reviewed ? Math.max(0, Math.min(1, c.similarity.max_score)) * 30 : 0
  const ai = c.ai ? AI_WEIGHT[c.ai.level] : 0
  const flagged = c.review === 'flagged' ? 10 : 0
  return Math.max(0, Math.min(100, Math.round(trust + sim + ai + flagged)))
}

export function recommend(c: CaseInput, p: number, threshold: number): RankedCase['recommendation'] {
  if (c.held && c.review === 'cleared') return 'release_hold'
  if (!c.held && !c.released && c.review !== 'cleared' && p >= threshold) return 'hold'
  return 'none'
}

/** Ranked queue (highest priority first, cleared + zero cases dropped). Pure. */
export function rankCases(cases: readonly CaseInput[], p: Pick<IntegrityParams, 'hold_threshold' | 'max_cases'>): RankedCase[] {
  return cases
    .map((c) => { const pr = priority(c); return { ...c, priority: pr, recommendation: recommend(c, pr, p.hold_threshold) } })
    .filter((c) => c.priority > 0 || c.recommendation === 'release_hold')
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name))
    .slice(0, p.max_cases)
}

/** Facts for a summary (no names, no contact details) — what the AI sees and the template renders. Pure. */
export function caseFacts(c: CaseInput): string[] {
  const f: string[] = []
  if (c.trust) f.push(`trust:${c.trust.score}:${c.trust.incidents}:${c.trust.top.join('|')}`)
  if (c.similarity) f.push(`similar:${Math.round(c.similarity.max_score * 100)}:${Math.max(0, c.similarity.cluster_size - 1)}`)
  if (c.ai && c.ai.level !== 'none') f.push(`ai:${c.ai.level}:${c.ai.labels.join('|')}`)
  if (c.review !== 'unreviewed') f.push(`review:${c.review}`)
  return f
}
