/**
 * Judged formats (ideathon / pitch, system design jam): each judge scores
 * every rubric criterion out of its weight; the submission's score is the
 * mean of judge totals (0–100), optionally dropping the highest and lowest.
 * Reuses the hackathon judging math (rubricTotal, average).
 */
import { rubricTotal } from '@/lib/hackathons/final-scores'
import { average } from '@/lib/hackathons/calibration'
import type { ContestRubricCriterion, JudgeScore } from '../types'

export function judgeTotal(scores: { name: string; score: number }[], rubric: ContestRubricCriterion[]): number | null {
  return rubricTotal(scores, rubric)
}

export function judgedScore(judgeScores: JudgeScore[], opts: { dropHighLow: boolean }): number | null {
  return average(judgeScores.map((j) => j.total), { dropHighLow: opts.dropHighLow })
}

/** Clamp each criterion score to 0..weight; unknown criteria are dropped. */
export function cleanRubricScores(raw: unknown, rubric: ContestRubricCriterion[]): { name: string; score: number }[] | null {
  if (!Array.isArray(raw)) return null
  const out: { name: string; score: number }[] = []
  for (const c of rubric) {
    const g = raw.find((x) => x && typeof x === 'object' && (x as Record<string, unknown>).name === c.name) as Record<string, unknown> | undefined
    const n = Number(g?.score)
    if (!Number.isFinite(n)) return null
    out.push({ name: c.name, score: Math.max(0, Math.min(c.weight, Math.round(n * 10) / 10)) })
  }
  return out
}

/** Words in a write-up (system design word limit). */
export function wordCount(text: string): number {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean).length
}
