/**
 * Hiring outcomes per candidate per test, and the predictive-validity maths
 * built on them.
 *
 * Collection `hiring_outcomes`, one doc per (exam_id, user_id):
 *   { id, exam_id, tenant_id, user_id, email, status,
 *     ratings: { d30?: Rating, d90?: Rating, d180?: Rating },
 *     history: [{ at, by, by_email, kind: 'status' | 'rating', from, to, period?, notes? }],
 *     created_at, updated_at }
 *
 * The maths is pure (no server imports) so it can be unit-tested and reused.
 *
 * Definitions (shown on the predictive-validity page):
 *   - Hire outcome: hired = 1, rejected = 0. Shortlisted / interviewed /
 *     offered are still in progress and withdrew is the candidate's choice,
 *     so they are left out of the hire correlation and hire rates.
 *   - Performance: mean of the candidate's 30/90/180-day ratings (1–5).
 *   - Correlation: Pearson r (with a 0/1 outcome this is the point-biserial r).
 *   - Fewer than MIN_SAMPLE pairs: "not enough data yet", no r is reported.
 */
import type { Db } from 'mongodb'

export const OUTCOME_STATUSES = ['shortlisted', 'interviewed', 'offered', 'hired', 'rejected', 'withdrew'] as const
export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number]

export const OUTCOME_LABELS: Record<OutcomeStatus, string> = {
  shortlisted: 'Shortlisted',
  interviewed: 'Interviewed',
  offered: 'Offered',
  hired: 'Hired',
  rejected: 'Rejected',
  withdrew: 'Withdrew',
}

export const RATING_PERIODS = [30, 90, 180] as const
export type RatingPeriod = (typeof RATING_PERIODS)[number]

export interface Rating { value: number; notes?: string; by: string; at: string }

export const MIN_SAMPLE = 30
export const MAX_BULK = 200

export function isOutcomeStatus(v: unknown): v is OutcomeStatus {
  return typeof v === 'string' && (OUTCOME_STATUSES as readonly string[]).includes(v)
}

export type OutcomeUpdate = {
  exam_id: string
  user_ids: string[]
  status: OutcomeStatus | null
  rating: { period: RatingPeriod; value: number; notes: string } | null
}

/** Validate a POST body (whitelisted fields only). */
export function parseOutcomeUpdate(body: unknown): { ok: true; value: OutcomeUpdate } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Invalid request.' }
  const b = body as Record<string, unknown>
  const exam_id = typeof b.exam_id === 'string' ? b.exam_id.trim().slice(0, 128) : ''
  if (!exam_id) return { ok: false, error: 'Choose a test.' }
  const ids = Array.isArray(b.user_ids) ? b.user_ids : []
  const user_ids = [...new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 128))]
  if (user_ids.length === 0) return { ok: false, error: 'Choose at least one candidate.' }
  if (user_ids.length > MAX_BULK) return { ok: false, error: `Update at most ${MAX_BULK} candidates at a time.` }
  let status: OutcomeStatus | null = null
  if (b.status !== undefined && b.status !== null) {
    if (!isOutcomeStatus(b.status)) return { ok: false, error: 'Unknown outcome.' }
    status = b.status
  }
  let rating: OutcomeUpdate['rating'] = null
  if (b.rating !== undefined && b.rating !== null) {
    const r = b.rating as Record<string, unknown>
    const period = Number(r?.period)
    const value = Number(r?.value)
    if (!(RATING_PERIODS as readonly number[]).includes(period)) return { ok: false, error: 'Rating period must be 30, 90 or 180 days.' }
    if (!Number.isInteger(value) || value < 1 || value > 5) return { ok: false, error: 'Rating must be a whole number from 1 to 5.' }
    rating = { period: period as RatingPeriod, value, notes: typeof r.notes === 'string' ? r.notes.trim().slice(0, 1000) : '' }
  }
  if (!status && !rating) return { ok: false, error: 'Nothing to update.' }
  return { ok: true, value: { exam_id, user_ids, status, rating } }
}

/** Mean of the stored ratings (1–5), or null when none. */
export function performanceOf(ratings: unknown): number | null {
  if (!ratings || typeof ratings !== 'object') return null
  const vals = RATING_PERIODS
    .map((p) => Number((ratings as Record<string, { value?: unknown } | undefined>)[`d${p}`]?.value))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 5)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
}

// ─── Statistics ──────────────────────────────────────────────────────────────

/** Pearson correlation; null when n < 2 or either side has no variance. */
export function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return null
  let sx = 0, sy = 0
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i] }
  const mx = sx / n, my = sy / n
  let cov = 0, vx = 0, vy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my
    cov += dx * dy; vx += dx * dx; vy += dy * dy
  }
  if (vx === 0 || vy === 0) return null
  return Math.max(-1, Math.min(1, cov / Math.sqrt(vx * vy)))
}

export interface CorrelationResult {
  n: number
  /** Null when n < MIN_SAMPLE ("not enough data yet") or no variance. */
  r: number | null
  enough: boolean
}

export function correlate(pairs: ReadonlyArray<[number, number]>, minSample = MIN_SAMPLE): CorrelationResult {
  const n = pairs.length
  if (n < minSample) return { n, r: null, enough: false }
  const r = pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1]))
  return { n, r: r === null ? null : Math.round(r * 1000) / 1000, enough: true }
}

export const SCORE_BANDS = [
  { id: '0-39', label: '0–39%', min: 0, max: 39 },
  { id: '40-59', label: '40–59%', min: 40, max: 59 },
  { id: '60-79', label: '60–79%', min: 60, max: 79 },
  { id: '80-100', label: '80–100%', min: 80, max: 100 },
] as const

export function bandFor(score: number): (typeof SCORE_BANDS)[number] {
  const s = Math.max(0, Math.min(100, Math.round(score)))
  return SCORE_BANDS.find((b) => s >= b.min && s <= b.max) ?? SCORE_BANDS[0]
}

export interface ValidityRow {
  /** Overall test score, 0–100. */
  score: number
  /** Section id → section score 0–100 (null = no scored points). */
  sections?: Record<string, number | null>
  status: OutcomeStatus
  /** Mean rating 1–5, or null. */
  performance: number | null
}

export interface BandSummary {
  id: string
  label: string
  /** Candidates in the band with any recorded outcome. */
  candidates: number
  /** Hired + rejected (the hire-rate denominator). */
  decided: number
  hired: number
  /** hired / decided, null when nobody decided. */
  hireRate: number | null
  rated: number
  avgPerformance: number | null
}

export interface ValidityReport {
  total: number
  counts: Record<OutcomeStatus, number>
  minSample: number
  hire: CorrelationResult
  performance: CorrelationResult
  bands: BandSummary[]
  sections: Array<{ id: string; title: string; hire: CorrelationResult; performance: CorrelationResult }>
}

const hireValue = (s: OutcomeStatus): number | null => (s === 'hired' ? 1 : s === 'rejected' ? 0 : null)
const round2 = (n: number) => Math.round(n * 100) / 100

export function buildValidityReport(
  rows: readonly ValidityRow[],
  sectionMeta: ReadonlyArray<{ id: string; title: string }> = [],
  minSample = MIN_SAMPLE,
): ValidityReport {
  const counts = Object.fromEntries(OUTCOME_STATUSES.map((s) => [s, 0])) as Record<OutcomeStatus, number>
  for (const r of rows) counts[r.status]++

  const hirePairs = (pick: (r: ValidityRow) => number | null | undefined): Array<[number, number]> =>
    rows.flatMap((r) => {
      const h = hireValue(r.status)
      const x = pick(r)
      return h === null || x === null || x === undefined || !Number.isFinite(x) ? [] : [[x, h] as [number, number]]
    })
  const perfPairs = (pick: (r: ValidityRow) => number | null | undefined): Array<[number, number]> =>
    rows.flatMap((r) => {
      const x = pick(r)
      return r.status !== 'hired' || r.performance === null || x === null || x === undefined || !Number.isFinite(x) ? [] : [[x, r.performance] as [number, number]]
    })

  const bands: BandSummary[] = SCORE_BANDS.map((b) => {
    const inBand = rows.filter((r) => bandFor(r.score).id === b.id)
    const decided = inBand.filter((r) => hireValue(r.status) !== null)
    const hired = decided.filter((r) => r.status === 'hired').length
    const rated = inBand.filter((r) => r.status === 'hired' && r.performance !== null)
    return {
      id: b.id,
      label: b.label,
      candidates: inBand.length,
      decided: decided.length,
      hired,
      hireRate: decided.length ? round2(hired / decided.length) : null,
      rated: rated.length,
      avgPerformance: rated.length ? round2(rated.reduce((a, r) => a + (r.performance as number), 0) / rated.length) : null,
    }
  })

  return {
    total: rows.length,
    counts,
    minSample,
    hire: correlate(hirePairs((r) => r.score), minSample),
    performance: correlate(perfPairs((r) => r.score), minSample),
    bands,
    sections: sectionMeta.map((s) => ({
      id: s.id,
      title: s.title,
      hire: correlate(hirePairs((r) => r.sections?.[s.id]), minSample),
      performance: correlate(perfPairs((r) => r.sections?.[s.id]), minSample),
    })),
  }
}

// ─── Storage helpers ─────────────────────────────────────────────────────────

export const OUTCOMES_COLLECTION = 'hiring_outcomes'

let indexesReady: Promise<void> | null = null
export function ensureOutcomeIndexes(db: Db): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      try {
        await db.collection(OUTCOMES_COLLECTION).createIndex({ exam_id: 1, user_id: 1 }, { unique: true, name: 'hiring_outcomes_exam_user' })
        await db.collection(OUTCOMES_COLLECTION).createIndex({ tenant_id: 1, status: 1 }, { name: 'hiring_outcomes_tenant_status' })
      } catch (e) {
        console.error('[CodeSpectra] ensureOutcomeIndexes:', e)
      }
    })()
  }
  return indexesReady
}

/** user_id → outcome doc for one test. */
export async function outcomesByUser(db: Db, examId: string): Promise<Map<string, Record<string, unknown>>> {
  const docs = await db.collection(OUTCOMES_COLLECTION).find({ exam_id: examId }, { projection: { _id: 0 } }).toArray()
  return new Map(docs.map((d) => [String(d.user_id), d as Record<string, unknown>]))
}
