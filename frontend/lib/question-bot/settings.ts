/**
 * Question bot settings + spend caps (pure, client-safe).
 *
 * Off by default. Safe defaults: 100 questions a day, 25 a run, $5 a month.
 * The nightly run starts at `run_hour_utc`; "Run now" ignores the hour and the
 * on/off switch but never the caps.
 */
import { z } from 'zod'

export interface QuestionBotSettings {
  enabled: boolean
  /** Max questions written per UTC day (all runs together). */
  daily_question_cap: number
  /** Max questions per run. */
  per_run_cap: number
  /** Max questions per (domain, type, difficulty) batch. */
  per_cell_cap: number
  /** Monthly AI spend cap in USD (estimated from tokens). */
  monthly_cost_cap_usd: number
  /** Nightly run from this UTC hour. */
  run_hour_utc: number
}

export const DEFAULT_BOT_SETTINGS: QuestionBotSettings = {
  enabled: false,
  daily_question_cap: 100,
  per_run_cap: 25,
  per_cell_cap: 10,
  monthly_cost_cap_usd: 5,
  run_hour_utc: 2,
}

export const BotSettingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  daily_question_cap: z.coerce.number().int().min(0).max(2000).optional(),
  per_run_cap: z.coerce.number().int().min(1).max(500).optional(),
  per_cell_cap: z.coerce.number().int().min(1).max(50).optional(),
  monthly_cost_cap_usd: z.coerce.number().min(0).max(1000).optional(),
  run_hour_utc: z.coerce.number().int().min(0).max(23).optional(),
}).strict()

/** Validate a settings change from the admin UI. Pure. */
export function cleanBotSettingsPatch(raw: unknown): { ok: true; patch: Partial<QuestionBotSettings> } | { ok: false; error: string } {
  const r = BotSettingsPatchSchema.safeParse(raw)
  if (!r.success) {
    const i = r.error.issues[0]
    return { ok: false, error: i ? `${i.path.join('.') || 'settings'}: ${i.message}` : 'Invalid settings' }
  }
  const patch: Partial<QuestionBotSettings> = {}
  for (const [k, v] of Object.entries(r.data)) if (v !== undefined) (patch as Record<string, unknown>)[k] = v
  if (typeof patch.monthly_cost_cap_usd === 'number') patch.monthly_cost_cap_usd = Math.round(patch.monthly_cost_cap_usd * 100) / 100
  return { ok: true, patch }
}

export interface RunBudget {
  /** Questions this run may write (0 = don't run). */
  questions: number
  /** Why the budget is 0 (shown to admins), when it is. */
  blocked?: string
}

/** How much this run may write, given today's output and this month's spend. Pure. */
export function runBudget(s: QuestionBotSettings, writtenToday: number, spentThisMonthUsd: number): RunBudget {
  if (spentThisMonthUsd >= s.monthly_cost_cap_usd) return { questions: 0, blocked: `Monthly AI cap reached ($${spentThisMonthUsd.toFixed(2)} of $${s.monthly_cost_cap_usd.toFixed(2)})` }
  const leftToday = Math.max(0, s.daily_question_cap - Math.max(0, writtenToday))
  if (leftToday === 0) return { questions: 0, blocked: `Daily cap reached (${s.daily_question_cap} questions)` }
  return { questions: Math.min(leftToday, s.per_run_cap) }
}

/** Is the nightly run due at `now`? (enabled and at/after the run hour). Pure. */
export function nightlyDue(s: Pick<QuestionBotSettings, 'enabled' | 'run_hour_utc'>, now: Date): boolean {
  return s.enabled && now.getUTCHours() >= s.run_hour_utc
}
