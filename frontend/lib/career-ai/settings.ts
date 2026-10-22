/**
 * Career AI settings + spend caps (pure, client-safe): résumé writing help
 * (summary / bullet suggestions). Safe defaults: on, 500 calls a day across
 * the platform, 5 a day per learner, $5 a month. Admins change them at
 * /api/admin/career-ai. Credits are still charged per call on top.
 */
import { z } from 'zod'

export interface CareerAiSettings {
  resume_ai: boolean
  daily_cap: number
  per_user_daily_cap: number
  monthly_cost_cap_usd: number
  /** Estimated cost of one call (USD), for the monthly cap. */
  cost_per_call_usd: number
}

export const DEFAULT_CAREER_AI: CareerAiSettings = { resume_ai: true, daily_cap: 500, per_user_daily_cap: 5, monthly_cost_cap_usd: 5, cost_per_call_usd: 0.002 }

export const CareerAiPatch = z.object({
  resume_ai: z.boolean().optional(),
  daily_cap: z.coerce.number().int().min(0).max(100_000).optional(),
  per_user_daily_cap: z.coerce.number().int().min(0).max(200).optional(),
  monthly_cost_cap_usd: z.coerce.number().min(0).max(1000).optional(),
  cost_per_call_usd: z.coerce.number().min(0).max(1).optional(),
}).strict()

export interface CareerAiUsage { day: string | null; day_count: number; month: string | null; month_cost_usd: number }

export type CapVerdict = { ok: true } | { ok: false; code: 'career_ai_off' | 'career_ai_monthly_cap' | 'career_ai_daily_cap' | 'career_ai_user_cap' }

/** May this call use AI? Pure. */
export function careerAiAllowed(s: CareerAiSettings, u: CareerAiUsage, userToday: number, now: Date): CapVerdict {
  if (!s.resume_ai) return { ok: false, code: 'career_ai_off' }
  const day = now.toISOString().slice(0, 10)
  const month = now.toISOString().slice(0, 7)
  if ((u.month === month ? u.month_cost_usd : 0) >= s.monthly_cost_cap_usd) return { ok: false, code: 'career_ai_monthly_cap' }
  if ((u.day === day ? u.day_count : 0) >= s.daily_cap) return { ok: false, code: 'career_ai_daily_cap' }
  if (userToday >= s.per_user_daily_cap) return { ok: false, code: 'career_ai_user_cap' }
  return { ok: true }
}

export function mergeCareerAi(raw: unknown): CareerAiSettings {
  const r = CareerAiPatch.safeParse(raw && typeof raw === 'object' ? Object.fromEntries(Object.entries(raw).filter(([k]) => k in DEFAULT_CAREER_AI)) : {})
  return r.success ? { ...DEFAULT_CAREER_AI, ...Object.fromEntries(Object.entries(r.data).filter(([, v]) => v !== undefined)) } : DEFAULT_CAREER_AI
}
