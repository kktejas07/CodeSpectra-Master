/**
 * Phase J3/J4 — judging configuration.
 *
 * Stored on the hackathon doc as `judging_config`. Published to every
 * authenticated viewer (fairness: the rubric is visible before the event).
 *
 * Client-safe: pure types + defaults + validation only, zero server imports
 * (the judge tab and admin editor import this directly).
 *
 * ponytail: mirrors the 6 SCREENING_CRITERIA keys from ai-screening.ts as a
 * plain literal map instead of importing it — ai-screening.ts pulls in the
 * backendComplete LLM chain (server-only) which must never enter the client
 * bundle. Six strings duplicated beats a server/client boundary violation.
 */

export interface JudgingCriterion {
  key: string
  label: string
  weight: number
}

export interface JudgingConfig {
  criteria: JudgingCriterion[]
  /** Blend weight for the AI screening total (0–1). Human weight = 1 - aiWeight. */
  aiWeight: number
  /** Top-N blended entries marked as advancing. */
  advanceTopN: number
  /** How many top entries the public results page shows. */
  displayCount: number
  /** When true, judge UI masks team names in the final board / compare / reports. */
  blindMode: boolean
  /** When true, each submission's highest + lowest human totals are dropped before averaging. */
  dropHighLow: boolean
}

/** Canonical criterion labels, keyed by the screening criterion key. */
export const JUDGING_CRITERION_LABELS: Record<string, string> = {
  relevance: 'Problem relevance',
  innovation: 'Innovation & originality',
  implementation: 'Implementation quality',
  ai_use: 'Effective AI use',
  ux: 'User experience',
  completeness: 'Completeness',
}

export const JUDGING_CRITERION_KEYS: string[] = Object.keys(JUDGING_CRITERION_LABELS)

export const DEFAULT_JUDGING_CONFIG: JudgingConfig = {
  criteria: JUDGING_CRITERION_KEYS.map((key) => ({
    key,
    label: JUDGING_CRITERION_LABELS[key] || key,
    weight: 1,
  })),
  aiWeight: 0.4,
  advanceTopN: 10,
  displayCount: 3,
  blindMode: false,
  dropHighLow: false,
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

/**
 * Validate + normalize any stored/posted judging config. Unknown criteria,
 * dupes, and out-of-range numbers are dropped/clamped; anything missing
 * falls back to defaults. Never throws.
 */
export function sanitizeJudgingConfig(raw: unknown): JudgingConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const seen = new Set<string>()
  const criteria: JudgingCriterion[] = []
  const rawCriteria = Array.isArray(r.criteria) ? r.criteria : []
  for (const c of rawCriteria) {
    if (!c || typeof c !== 'object') continue
    const key = String((c as Record<string, unknown>).key || '').trim()
    if (!key || seen.has(key)) continue
    if (!(key in JUDGING_CRITERION_LABELS)) continue
    seen.add(key)
    criteria.push({
      key,
      label: JUDGING_CRITERION_LABELS[key] || key,
      weight: clamp(num((c as Record<string, unknown>).weight, 1), 0, 5),
    })
  }
  if (criteria.length === 0) {
    for (const c of DEFAULT_JUDGING_CONFIG.criteria) criteria.push({ ...c })
  }
  const advanceTopN = Math.round(clamp(num(r.advanceTopN, DEFAULT_JUDGING_CONFIG.advanceTopN), 1, 100))
  const displayCount = Math.round(clamp(num(r.displayCount, DEFAULT_JUDGING_CONFIG.displayCount), 1, 100))
  return {
    criteria,
    aiWeight: clamp(num(r.aiWeight, DEFAULT_JUDGING_CONFIG.aiWeight), 0, 1),
    advanceTopN: Number.isFinite(advanceTopN) ? advanceTopN : DEFAULT_JUDGING_CONFIG.advanceTopN,
    displayCount: Number.isFinite(displayCount) ? displayCount : DEFAULT_JUDGING_CONFIG.displayCount,
    blindMode: (r.blindMode as boolean) === true,
    dropHighLow: (r.dropHighLow as boolean) === true,
  }
}

/** key → weight map, compatible with scoreTotals-style weighted math. */
export function judgingWeights(cfg: JudgingConfig | null | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  const list = (cfg && Array.isArray(cfg.criteria) ? cfg.criteria : DEFAULT_JUDGING_CONFIG.criteria) || []
  for (const c of list) {
    if (!c || typeof c.key !== 'string') continue
    out[c.key] = typeof c.weight === 'number' && Number.isFinite(c.weight) ? c.weight : 1
  }
  for (const k of JUDGING_CRITERION_KEYS) {
    if (!(k in out)) out[k] = 1
  }
  return out
}
