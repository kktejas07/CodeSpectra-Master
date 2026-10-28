/**
 * Study plan settings + AI caps (pure, client-safe). The AI only words the weekly coach note;
 * plan selection never depends on it. Safe defaults: on, 300 notes a day, $3 a month.
 */
import { z } from 'zod'

export interface StudyPlanSettings {
  ai_notes: boolean
  daily_ai_cap: number
  monthly_cost_cap_usd: number
  /** default reminder hour for new plans (learner local time) */
  default_reminder_hour: number
}

export const DEFAULT_STUDY_SETTINGS: StudyPlanSettings = { ai_notes: true, daily_ai_cap: 300, monthly_cost_cap_usd: 3, default_reminder_hour: 19 }

export const StudySettingsPatch = z.object({
  ai_notes: z.boolean().optional(),
  daily_ai_cap: z.coerce.number().int().min(0).max(10_000).optional(),
  monthly_cost_cap_usd: z.coerce.number().min(0).max(500).optional(),
  default_reminder_hour: z.coerce.number().int().min(0).max(23).optional(),
}).strict()

export interface AiUsage { day: string | null; day_count: number; month: string | null; month_cost_usd: number }

/** May this note use AI? Pure. */
export function aiAllowed(s: StudyPlanSettings, u: AiUsage, now: Date): { ok: true } | { ok: false; reason: string } {
  if (!s.ai_notes) return { ok: false, reason: 'AI notes are off' }
  const day = now.toISOString().slice(0, 10)
  const month = now.toISOString().slice(0, 7)
  const dayCount = u.day === day ? u.day_count : 0
  const monthCost = u.month === month ? u.month_cost_usd : 0
  if (monthCost >= s.monthly_cost_cap_usd) return { ok: false, reason: 'Monthly AI cap reached' }
  if (dayCount >= s.daily_ai_cap) return { ok: false, reason: 'Daily AI cap reached' }
  return { ok: true }
}
