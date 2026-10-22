/** Guardian report share settings + relations (pure, client-safe; no catalogs). */
export const SHARE_KEYS = ['practice_time', 'tests', 'score_trend', 'streak', 'study_plan', 'drives'] as const
export type ShareKey = (typeof SHARE_KEYS)[number]
export type ShareSettings = Record<ShareKey, boolean>

export const DEFAULT_SHARE: ShareSettings = { practice_time: true, tests: true, score_trend: true, streak: true, study_plan: true, drives: true }

export function normalizeShare(raw: unknown, base: ShareSettings = DEFAULT_SHARE): ShareSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = { ...base }
  for (const k of SHARE_KEYS) if (typeof r[k] === 'boolean') out[k] = r[k] as boolean
  return out
}

export const RELATIONS = ['parent', 'guardian', 'other'] as const
export type Relation = (typeof RELATIONS)[number]

/** Max guardians (invited + active) per learner. */
export const MAX_GUARDIANS = 2
