/**
 * Social studio settings + AI caps (pure, client-safe).
 *
 * Safe defaults: AI drafts on, 40 drafts a day, $2 a month. A "draft" is one
 * model call that writes the captions for every platform in one language.
 */
import { z } from 'zod'

export interface SocialSettings {
  ai_enabled: boolean
  /** Max AI drafts per UTC day (all admins together). */
  daily_ai_cap: number
  /** Monthly AI spend cap in USD for feature `social_studio`. */
  monthly_cost_cap_usd: number
}

export const DEFAULT_SOCIAL_SETTINGS: SocialSettings = { ai_enabled: true, daily_ai_cap: 40, monthly_cost_cap_usd: 2 }

export const SocialSettingsPatchSchema = z.object({
  ai_enabled: z.boolean().optional(),
  daily_ai_cap: z.coerce.number().int().min(0).max(1000).optional(),
  monthly_cost_cap_usd: z.coerce.number().min(0).max(500).optional(),
}).strict()

export function mergeSocialSettings(raw: unknown): SocialSettings {
  const r = SocialSettingsPatchSchema.safeParse(raw && typeof raw === 'object' ? raw : {})
  return { ...DEFAULT_SOCIAL_SETTINGS, ...(r.success ? Object.fromEntries(Object.entries(r.data).filter(([, v]) => v !== undefined)) : {}) }
}

export type AiBlock = 'off' | 'daily_cap' | 'monthly_cap'

/** Why an AI draft may not run now, or null (pure). */
export function aiBlocked(s: SocialSettings, draftsToday: number, spentThisMonthUsd: number): AiBlock | null {
  if (!s.ai_enabled) return 'off'
  if (spentThisMonthUsd >= s.monthly_cost_cap_usd) return 'monthly_cap'
  if (draftsToday >= s.daily_ai_cap) return 'daily_cap'
  return null
}
