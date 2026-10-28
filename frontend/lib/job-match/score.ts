/**
 * Explainable job ↔ learner match score (pure; tests/job-match.test.ts).
 *
 *   skills      job skills covered, each weighted by the learner's VERIFIED
 *               passport level (expert 1 … beginner 0.4; self-reported 0.2)
 *   location    remote job, same city, same country, or open to relocate
 *   experience  years vs the job's min / max
 *   salary      expectation vs the job's band (annual, integer minor units,
 *               same currency only)
 *
 * A part with nothing to compare (job lists no skills, no location given…) is
 * left out and the other weights are re-normalised, so missing data never
 * drags a score down or props it up. Every part reports what it saw, so the
 * UI can say why.
 */
import { canonicalSkill } from '@/lib/ats/skills'

export type MatchLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert' | 'self'
export const LEVEL_CREDIT: Record<MatchLevel, number> = { expert: 1, advanced: 0.85, intermediate: 0.65, beginner: 0.4, self: 0.2 }

export interface MatchWeights { skills: number; location: number; experience: number; salary: number }
export const DEFAULT_WEIGHTS: MatchWeights = { skills: 0.6, location: 0.15, experience: 0.15, salary: 0.1 }

export interface MatchJob {
  skills: string[]
  location?: string | null
  work_mode?: 'onsite' | 'hybrid' | 'remote' | null
  experience_min?: number | null
  experience_max?: number | null
  salary?: { min?: number; max?: number; currency?: string; period?: 'year' | 'month' | 'hour' } | null
}

export interface MatchProfile {
  skills: Array<{ skill: string; level: MatchLevel }>
  city?: string | null
  country?: string | null
  open_to_relocate?: boolean
  experience_years?: number | null
  /** Annual expectation in integer minor units (paise / cents). */
  expected_salary_minor?: number | null
  currency?: string | null
}

export type PartKey = keyof MatchWeights
export interface MatchPart { key: PartKey; score: number; weight: number; note: string }
export interface MatchResult {
  score: number
  parts: MatchPart[]
  matched: Array<{ skill: string; level: MatchLevel }>
  missing: string[]
}

const PERIOD_FACTOR = { year: 1, month: 12, hour: 2080 } as const

/** Job salary (major units per period) → annual integer minor units. */
export function annualMinor(amount: number | undefined, period: 'year' | 'month' | 'hour' = 'year'): number | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null
  return Math.round(amount * 100 * PERIOD_FACTOR[period])
}

const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase()

export function skillPart(job: MatchJob, p: MatchProfile): { part: MatchPart | null; matched: MatchResult['matched']; missing: string[] } {
  const wanted = [...new Set(job.skills.map((s) => canonicalSkill(s)).filter(Boolean))]
  if (!wanted.length) return { part: null, matched: [], missing: [] }
  const best = new Map<string, MatchLevel>()
  for (const s of p.skills) {
    const k = canonicalSkill(s.skill)
    const cur = best.get(k)
    if (!cur || LEVEL_CREDIT[s.level] > LEVEL_CREDIT[cur]) best.set(k, s.level)
  }
  const matched: MatchResult['matched'] = []
  const missing: string[] = []
  let credit = 0
  for (const w of wanted) {
    const lv = best.get(w)
    if (lv) { matched.push({ skill: w, level: lv }); credit += LEVEL_CREDIT[lv] } else missing.push(w)
  }
  return { part: { key: 'skills', score: Math.round((credit / wanted.length) * 100), weight: 0, note: `${matched.length}/${wanted.length}` }, matched, missing }
}

export function locationPart(job: MatchJob, p: MatchProfile): MatchPart | null {
  if (job.work_mode === 'remote') return { key: 'location', score: 100, weight: 0, note: 'remote' }
  const loc = norm(job.location)
  if (!loc) return null
  const city = norm(p.city)
  const country = norm(p.country)
  if (!city && !country) return p.open_to_relocate ? { key: 'location', score: 70, weight: 0, note: 'relocate' } : null
  if (city && loc.includes(city)) return { key: 'location', score: 100, weight: 0, note: 'same_city' }
  if (job.work_mode === 'hybrid' && p.open_to_relocate) return { key: 'location', score: 75, weight: 0, note: 'relocate' }
  if (p.open_to_relocate) return { key: 'location', score: 70, weight: 0, note: 'relocate' }
  if (country && (loc.split(/[\s,]+/).includes(country) || loc.endsWith(country))) return { key: 'location', score: 60, weight: 0, note: 'same_country' }
  return { key: 'location', score: 20, weight: 0, note: 'elsewhere' }
}

export function experiencePart(job: MatchJob, p: MatchProfile): MatchPart | null {
  const y = p.experience_years
  const min = job.experience_min ?? null
  const max = job.experience_max ?? null
  if (y === null || y === undefined || !Number.isFinite(y) || (min === null && max === null)) return null
  if (min !== null && y < min) return { key: 'experience', score: Math.max(0, Math.round(100 - (min - y) * 35)), weight: 0, note: 'below' }
  if (max !== null && y > max) return { key: 'experience', score: 80, weight: 0, note: 'above' }
  return { key: 'experience', score: 100, weight: 0, note: 'within' }
}

export function salaryPart(job: MatchJob, p: MatchProfile): MatchPart | null {
  const exp = p.expected_salary_minor
  const s = job.salary
  if (!exp || exp <= 0 || !s) return null
  if (s.currency && p.currency && s.currency.toUpperCase() !== p.currency.toUpperCase()) return null
  const top = annualMinor(s.max, s.period) ?? annualMinor(s.min, s.period)
  if (!top) return null
  if (exp <= top) return { key: 'salary', score: 100, weight: 0, note: 'within' }
  const over = (exp - top) / top
  return { key: 'salary', score: Math.max(0, Math.round(100 - over * 200)), weight: 0, note: 'above' }
}

export function matchScore(job: MatchJob, p: MatchProfile, weights: MatchWeights = DEFAULT_WEIGHTS): MatchResult {
  const sk = skillPart(job, p)
  const parts = [sk.part, locationPart(job, p), experiencePart(job, p), salaryPart(job, p)].filter((x): x is MatchPart => !!x)
  const total = parts.reduce((t, x) => t + weights[x.key], 0)
  if (!parts.length || total <= 0) return { score: 0, parts: [], matched: sk.matched, missing: sk.missing }
  for (const x of parts) x.weight = Math.round((weights[x.key] / total) * 100) / 100
  const score = Math.round(parts.reduce((t, x) => t + x.score * (weights[x.key] / total), 0))
  return { score, parts, matched: sk.matched, missing: sk.missing }
}

/** Passport level string → match level (unknown → self-reported). */
export function toMatchLevel(level: string | null | undefined): MatchLevel {
  return level === 'expert' || level === 'advanced' || level === 'intermediate' || level === 'beginner' ? level : 'self'
}

/** Sort: score, then more verified matches, then newer job. */
export function rankMatches<T extends { match: MatchResult; created_at?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.match.score - a.match.score || b.match.matched.length - a.match.matched.length || String(b.created_at || '').localeCompare(String(a.created_at || '')))
}
