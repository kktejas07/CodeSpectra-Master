/**
 * Agent loop settings + AI caps (pure, client-safe).
 *
 * Defaults: the read-only loops (content QA, SEO gaps, analytics insight) are
 * ON; anything that changes what members see, messages people or spends AI by
 * default (community moderator, social pack) is OFF. AI inside every loop is
 * capped per day (calls) and per month (USD, feature spend from recordAiUsage)
 * and stops at the platform budget hard stop; each loop has a deterministic
 * fallback when AI is off or blocked.
 */
import { z } from 'zod'
import { CAPTION_LANGS, type CaptionLang } from '@/lib/social/types'
import { loopDef, type AgentLoopId } from './registry'

export interface AgentLoopSettings {
  enabled: boolean
  /** Let the loop call the AI model (within the caps). */
  use_ai: boolean
  /** Notify (in-app, plus email when the person allows it) when a run has something to say. */
  notify: boolean
  /** community-mod: hide clear spam right away (everything else is only reported). */
  auto_hide: boolean
  /** analytics-insight: also send each organisation's admins a note about their own organisation. */
  org_admins: boolean
  /** Max AI calls per UTC day for this loop. */
  daily_ai_cap: number
  /** Monthly AI spend cap in USD for this loop's feature. */
  monthly_cost_cap_usd: number
  /** Daily / weekly loops start at this UTC hour. */
  run_hour_utc: number
  /** Weekly loops: 0 = Sunday … 6 = Saturday (UTC). */
  weekday: number
  /** Items per run (pack size, posts scanned, links checked…). */
  max_items: number
  /** social-pack: caption languages. */
  langs: CaptionLang[]
}

const BASE: AgentLoopSettings = {
  enabled: false,
  use_ai: false,
  notify: false,
  auto_hide: false,
  org_admins: false,
  daily_ai_cap: 20,
  monthly_cost_cap_usd: 2,
  run_hour_utc: 3,
  weekday: 1,
  max_items: 20,
  langs: ['en'],
}

const DEFAULTS: Record<AgentLoopId, Partial<AgentLoopSettings>> = {
  'content-qa': { enabled: true, run_hour_utc: 2, weekday: 0, max_items: 15, daily_ai_cap: 0, monthly_cost_cap_usd: 0 },
  'seo-gap': { enabled: true, run_hour_utc: 4, weekday: 0, max_items: 10, daily_ai_cap: 10, monthly_cost_cap_usd: 1 },
  'community-mod': { enabled: false, max_items: 100, daily_ai_cap: 20, monthly_cost_cap_usd: 1 },
  // Notes are always kept in the run log; sending them is a separate switch (off).
  'analytics-insight': { enabled: true, run_hour_utc: 3, weekday: 1, max_items: 8, daily_ai_cap: 5, monthly_cost_cap_usd: 1 },
  // 03:00 UTC = 08:30 IST, before the first suggested posting slot.
  'social-pack': { enabled: false, use_ai: true, notify: true, run_hour_utc: 3, max_items: 3, langs: ['en', 'hi', 'te'], daily_ai_cap: 9, monthly_cost_cap_usd: 1 },
}

export function defaultLoopSettings(id: AgentLoopId): AgentLoopSettings {
  return { ...BASE, ...DEFAULTS[id], enabled: loopDef(id).defaultEnabled && (DEFAULTS[id].enabled ?? true) }
}

export const LoopSettingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  use_ai: z.boolean().optional(),
  notify: z.boolean().optional(),
  auto_hide: z.boolean().optional(),
  org_admins: z.boolean().optional(),
  daily_ai_cap: z.coerce.number().int().min(0).max(500).optional(),
  monthly_cost_cap_usd: z.coerce.number().min(0).max(200).optional(),
  run_hour_utc: z.coerce.number().int().min(0).max(23).optional(),
  weekday: z.coerce.number().int().min(0).max(6).optional(),
  max_items: z.coerce.number().int().min(1).max(200).optional(),
  langs: z.array(z.enum(CAPTION_LANGS)).min(1).max(3).optional(),
}).strict()
export type LoopSettingsPatch = z.infer<typeof LoopSettingsPatchSchema>

/** Stored values over the loop's defaults; anything invalid is ignored. Pure. */
export function mergeLoopSettings(id: AgentLoopId, raw: unknown): AgentLoopSettings {
  const r = LoopSettingsPatchSchema.safeParse(raw && typeof raw === 'object' ? raw : {})
  const clean = r.success ? Object.fromEntries(Object.entries(r.data).filter(([, v]) => v !== undefined)) : {}
  const s = { ...defaultLoopSettings(id), ...clean } as AgentLoopSettings
  s.monthly_cost_cap_usd = Math.round(s.monthly_cost_cap_usd * 100) / 100
  s.langs = [...new Set(s.langs)]
  return s
}

export type LoopAiBlock = 'off' | 'daily_cap' | 'monthly_cap' | 'budget' | 'flagged' | 'ai_failed'

/** Why this loop may not call AI now, or null (pure). */
export function loopAiBlocked(s: Pick<AgentLoopSettings, 'use_ai' | 'daily_ai_cap' | 'monthly_cost_cap_usd'>, callsToday: number, spentThisMonthUsd: number): LoopAiBlock | null {
  if (!s.use_ai) return 'off'
  if (spentThisMonthUsd >= s.monthly_cost_cap_usd) return 'monthly_cap'
  if (callsToday >= s.daily_ai_cap) return 'daily_cap'
  return null
}
