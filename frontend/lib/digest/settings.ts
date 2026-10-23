/**
 * Daily digest settings (pure, client-safe). Admin → Daily digest edits them;
 * every field has a safe default so the digest runs with nothing configured.
 *
 * Defaults (owner's request): 25 items, ~8 events / ~7 news / ~5 Learn /
 * ~5 contests and other, published by itself at 08:00 IST, AI summaries
 * within small caps (deterministic template text when AI is off / capped).
 */
import { z } from 'zod'
import { DIGEST_GROUPS, type DigestGroup } from './types'

export interface RankWeights {
  freshness: number
  deadline: number
  prize: number
  trust: number
  relevance: number
  engagement: number
  language: number
}

export interface DigestSettings {
  enabled: boolean
  /** Items per digest. */
  n: number
  quotas: Record<DigestGroup, number>
  /** No more than this many items of one category (hackathon, news, …). */
  max_per_category: number
  /** No more than this many items from one source (devpost, hn-frontpage, …). */
  max_per_source: number
  weights: RankWeights
  /** IANA zone the digest day and publish time are in. */
  timezone: string
  /** "HH:MM" local time. */
  publish_time: string
  /** true = publish at once; false = wait for an admin in review. */
  auto_publish: boolean
  /** First run with no digest yet: publish once immediately. */
  bootstrap: boolean
  /** Don't repeat an item featured in the last N days (unless its deadline is within 48 h). */
  repeat_days: number
  /** News / Learn older than this are too old for a daily digest. */
  max_age_days: number
  /** Check source links (HEAD/GET with timeout, SSRF guard). */
  check_links: boolean
  ai_enabled: boolean
  /** Model calls per day (all runs together). */
  daily_ai_cap: number
  /** Monthly spend cap in USD for feature `daily_digest`. */
  monthly_cost_cap_usd: number
  /** Email + WhatsApp to opted-in subscribers of topic 'digest'. */
  notify_subscribers: boolean
}

export const DEFAULT_WEIGHTS: RankWeights = { freshness: 1, deadline: 1.2, prize: 0.8, trust: 1, relevance: 1, engagement: 0.6, language: 0.3 }

export const DEFAULT_DIGEST_SETTINGS: DigestSettings = {
  enabled: true,
  n: 25,
  quotas: { events: 8, news: 7, learn: 5, contests: 5 },
  max_per_category: 6,
  max_per_source: 4,
  weights: DEFAULT_WEIGHTS,
  timezone: 'Asia/Kolkata',
  publish_time: '08:00',
  auto_publish: true,
  bootstrap: true,
  repeat_days: 3,
  max_age_days: 7,
  check_links: true,
  ai_enabled: true,
  daily_ai_cap: 12,
  monthly_cost_cap_usd: 3,
  notify_subscribers: true,
}

const weight = z.coerce.number().min(0).max(5)
const quota = z.coerce.number().int().min(0).max(50)

export const DigestSettingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  n: z.coerce.number().int().min(1).max(60).optional(),
  quotas: z.object(Object.fromEntries(DIGEST_GROUPS.map((g) => [g, quota.optional()])) as Record<DigestGroup, z.ZodOptional<typeof quota>>).strict().optional(),
  max_per_category: z.coerce.number().int().min(1).max(60).optional(),
  max_per_source: z.coerce.number().int().min(1).max(60).optional(),
  weights: z.object({
    freshness: weight.optional(), deadline: weight.optional(), prize: weight.optional(), trust: weight.optional(),
    relevance: weight.optional(), engagement: weight.optional(), language: weight.optional(),
  }).strict().optional(),
  timezone: z.string().min(1).max(64).refine((tz) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false } }).optional(),
  publish_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  auto_publish: z.boolean().optional(),
  bootstrap: z.boolean().optional(),
  repeat_days: z.coerce.number().int().min(0).max(30).optional(),
  max_age_days: z.coerce.number().int().min(1).max(60).optional(),
  check_links: z.boolean().optional(),
  ai_enabled: z.boolean().optional(),
  daily_ai_cap: z.coerce.number().int().min(0).max(200).optional(),
  monthly_cost_cap_usd: z.coerce.number().min(0).max(500).optional(),
  notify_subscribers: z.boolean().optional(),
}).strict()
export type DigestSettingsPatch = z.infer<typeof DigestSettingsPatchSchema>

const defined = <T extends object>(o: T | undefined): Partial<T> => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== undefined)) as Partial<T>

/** Stored (possibly partial / invalid) settings → full settings (pure). */
export function mergeDigestSettings(raw: unknown): DigestSettings {
  const r = DigestSettingsPatchSchema.safeParse(raw && typeof raw === 'object' ? raw : {})
  const p = r.success ? r.data : {}
  return {
    ...DEFAULT_DIGEST_SETTINGS,
    ...defined(p),
    quotas: { ...DEFAULT_DIGEST_SETTINGS.quotas, ...defined(p.quotas) } as Record<DigestGroup, number>,
    weights: { ...DEFAULT_WEIGHTS, ...defined(p.weights) } as RankWeights,
  }
}

export type DigestAiBlock = 'off' | 'daily_cap' | 'monthly_cap'

/** Why the model may not be used now, or null (pure). */
export function digestAiBlocked(s: Pick<DigestSettings, 'ai_enabled' | 'daily_ai_cap' | 'monthly_cost_cap_usd'>, callsToday: number, spentThisMonthUsd: number): DigestAiBlock | null {
  if (!s.ai_enabled) return 'off'
  if (spentThisMonthUsd >= s.monthly_cost_cap_usd) return 'monthly_cap'
  if (callsToday >= s.daily_ai_cap) return 'daily_cap'
  return null
}
