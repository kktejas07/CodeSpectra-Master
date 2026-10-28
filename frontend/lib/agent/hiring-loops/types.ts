/**
 * Hiring agent loops (pure, client-safe): settings, defaults, validation and
 * the per-run budget. Four background agents built on the copilot framework
 * (lib/agent): they draft ProposedActions for an organisation admin to
 * confirm; nothing reaches a candidate unless a human confirms it, or an org
 * admin switched on auto-send for that one step.
 *
 *   sourcer    nightly: best matches for each open job → talent invites to approve;
 *              tracks replies and re-sources a stalled funnel
 *   scheduler  hourly: interviews nobody booked → slot offers from panel calendars;
 *              candidate-picked slots that failed → booking; no-shows → reschedule
 *   author     queue: JD → draft test, gap fill, synthetic dry run, then a create_test proposal
 *   integrity  hourly: integrity reports → ranked review queue, neutral evidence
 *              summaries, hold / release-hold proposals for scores
 *
 * Defaults: sourcer, scheduler and author OFF (they message people or spend
 * AI); the integrity review queue ON (read-only insight; AI summaries off,
 * hold proposals still need a human).
 */
import { z } from 'zod'

export const LOOP_IDS = ['sourcer', 'scheduler', 'author', 'integrity'] as const
export type LoopId = (typeof LOOP_IDS)[number]
export const isLoopId = (v: unknown): v is LoopId => typeof v === 'string' && (LOOP_IDS as readonly string[]).includes(v)

/** Steps an org admin may let run without a per-item confirmation. */
export const LOOP_STEPS: Record<LoopId, readonly string[]> = {
  sourcer: ['send_invites'],
  scheduler: ['offer_slots', 'book_requested'],
  author: ['create_draft_test'],
  integrity: ['hold_scores', 'release_hold'],
}

/** The write tool each step proposes (lib/agent/tools). */
export const STEP_TOOL: Record<string, string> = {
  send_invites: 'send_talent_invites',
  offer_slots: 'offer_interview_slots',
  book_requested: 'schedule_interview',
  create_draft_test: 'create_test',
  hold_scores: 'set_integrity_hold',
  release_hold: 'set_integrity_hold',
}

/** AI feature ids (recordAiUsage / AI spend page). */
export const LOOP_FEATURE: Record<LoopId, string> = {
  sourcer: 'hiring-agent-sourcer',
  scheduler: 'hiring-agent-scheduler',
  author: 'hiring-agent-author',
  integrity: 'hiring-agent-integrity',
}

/** Job health registry ids (lib/automation/job-registry.ts). */
export const LOOP_JOB_ID: Record<LoopId, string> = {
  sourcer: 'hiring-agent-sourcer',
  scheduler: 'hiring-agent-scheduler',
  author: 'hiring-agent-author',
  integrity: 'hiring-agent-integrity',
}

/** How often the tick looks at each loop (minutes). */
export const LOOP_EVERY_MINUTES: Record<LoopId, number> = { sourcer: 1440, scheduler: 60, author: 15, integrity: 60 }

export interface SourcerParams { min_match: number; invites_per_job: number; stall_days: number; max_jobs: number }
export interface SchedulerParams { stale_hours: number; max_offers: number; followup_hours: number; slots_offered: number }
export interface AuthorParams { max_rounds: number; dry_run_ai_grades: number; min_coverage_pct: number; target_questions: number }
export interface IntegrityParams { hold_threshold: number; ai_summaries: boolean; max_cases: number }

export interface LoopParams {
  sourcer: SourcerParams
  scheduler: SchedulerParams
  author: AuthorParams
  integrity: IntegrityParams
}

export interface LoopSettings<L extends LoopId = LoopId> {
  enabled: boolean
  /** step → run without a per-item confirmation (org admin only). */
  auto_send: Record<string, boolean>
  /** Proposals (or auto-sent items) per UTC day. */
  daily_item_cap: number
  /** Monthly AI spend cap in USD for this loop in this organisation. */
  monthly_cost_cap_usd: number
  /** Nightly loops start at this UTC hour (sourcer). */
  run_hour_utc: number
  params: LoopParams[L]
}

export const DEFAULT_PARAMS: LoopParams = {
  sourcer: { min_match: 60, invites_per_job: 10, stall_days: 7, max_jobs: 10 },
  scheduler: { stale_hours: 24, max_offers: 2, followup_hours: 48, slots_offered: 3 },
  author: { max_rounds: 2, dry_run_ai_grades: 3, min_coverage_pct: 80, target_questions: 15 },
  integrity: { hold_threshold: 60, ai_summaries: false, max_cases: 25 },
}

export function defaultSettings<L extends LoopId>(loop: L): LoopSettings<L> {
  return {
    enabled: loop === 'integrity',
    auto_send: Object.fromEntries(LOOP_STEPS[loop].map((s) => [s, false])),
    daily_item_cap: loop === 'sourcer' ? 50 : loop === 'author' ? 5 : 30,
    monthly_cost_cap_usd: loop === 'author' ? 5 : loop === 'integrity' ? 2 : 1,
    run_hour_utc: 1,
    params: { ...DEFAULT_PARAMS[loop] } as LoopParams[L],
  }
}

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max)

const PARAM_SCHEMAS = {
  sourcer: z.object({ min_match: int(0, 100), invites_per_job: int(1, 50), stall_days: int(1, 60), max_jobs: int(1, 100) }).partial().strict(),
  scheduler: z.object({ stale_hours: int(1, 336), max_offers: int(1, 5), followup_hours: int(6, 336), slots_offered: int(1, 5) }).partial().strict(),
  author: z.object({ max_rounds: int(1, 4), dry_run_ai_grades: int(0, 10), min_coverage_pct: int(0, 100), target_questions: int(3, 60) }).partial().strict(),
  integrity: z.object({ hold_threshold: int(0, 100), ai_summaries: z.boolean(), max_cases: int(1, 200) }).partial().strict(),
} as const

const BasePatch = z.object({
  enabled: z.boolean().optional(),
  auto_send: z.record(z.string().max(40), z.boolean()).optional(),
  daily_item_cap: int(0, 1000).optional(),
  monthly_cost_cap_usd: z.coerce.number().min(0).max(500).optional(),
  run_hour_utc: int(0, 23).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
}).strict()

export type SettingsPatch = Partial<Omit<LoopSettings, 'params'>> & { params?: Record<string, unknown> }

/** Validate an admin's change for one loop. Pure. */
export function cleanSettingsPatch(loop: LoopId, raw: unknown): { ok: true; patch: SettingsPatch } | { ok: false; error: string } {
  const r = BasePatch.safeParse(raw)
  if (!r.success) {
    const i = r.error.issues[0]
    return { ok: false, error: i ? `${i.path.join('.') || 'settings'}: ${i.message}` : 'Invalid settings' }
  }
  const patch: SettingsPatch = {}
  for (const [k, v] of Object.entries(r.data)) if (v !== undefined && k !== 'params' && k !== 'auto_send') (patch as Record<string, unknown>)[k] = v
  if (r.data.auto_send) {
    const bad = Object.keys(r.data.auto_send).find((s) => !LOOP_STEPS[loop].includes(s))
    if (bad) return { ok: false, error: `auto_send: unknown step "${bad}"` }
    patch.auto_send = r.data.auto_send
  }
  if (r.data.params) {
    const p = PARAM_SCHEMAS[loop].safeParse(r.data.params)
    if (!p.success) {
      const i = p.error.issues[0]
      return { ok: false, error: i ? `params.${i.path.join('.')}: ${i.message}` : 'Invalid params' }
    }
    patch.params = Object.fromEntries(Object.entries(p.data).filter(([, v]) => v !== undefined))
  }
  if (typeof patch.monthly_cost_cap_usd === 'number') patch.monthly_cost_cap_usd = Math.round(patch.monthly_cost_cap_usd * 100) / 100
  return { ok: true, patch }
}

/** Stored doc → settings (bad / missing values fall back to defaults). Pure. */
export function mergeSettings<L extends LoopId>(loop: L, raw: unknown): LoopSettings<L> {
  const base = defaultSettings(loop)
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const clean = cleanSettingsPatch(loop, {
    ...(typeof d.enabled === 'boolean' ? { enabled: d.enabled } : {}),
    ...(d.auto_send && typeof d.auto_send === 'object' ? { auto_send: Object.fromEntries(Object.entries(d.auto_send as Record<string, unknown>).filter(([k, v]) => LOOP_STEPS[loop].includes(k) && typeof v === 'boolean')) } : {}),
    ...(d.daily_item_cap !== undefined ? { daily_item_cap: d.daily_item_cap } : {}),
    ...(d.monthly_cost_cap_usd !== undefined ? { monthly_cost_cap_usd: d.monthly_cost_cap_usd } : {}),
    ...(d.run_hour_utc !== undefined ? { run_hour_utc: d.run_hour_utc } : {}),
    ...(d.params && typeof d.params === 'object' ? { params: Object.fromEntries(Object.entries(d.params as Record<string, unknown>).filter(([k]) => k in DEFAULT_PARAMS[loop])) } : {}),
  })
  if (!clean.ok) return base
  const p = clean.patch
  return {
    enabled: p.enabled ?? base.enabled,
    auto_send: { ...base.auto_send, ...(p.auto_send ?? {}) },
    daily_item_cap: p.daily_item_cap ?? base.daily_item_cap,
    monthly_cost_cap_usd: p.monthly_cost_cap_usd ?? base.monthly_cost_cap_usd,
    run_hour_utc: p.run_hour_utc ?? base.run_hour_utc,
    params: { ...base.params, ...(p.params ?? {}) } as LoopParams[L],
  }
}

export interface LoopBudget {
  /** Items (proposals / auto-sent actions) this run may create; 0 = do not run. */
  items: number
  /** May this run call an AI model? false = deterministic fallback only. */
  ai: boolean
  /** Why items is 0 (admin-facing), when it is. */
  blocked?: 'daily_cap' | 'disabled'
  /** Why ai is false. */
  ai_off?: 'monthly_cap' | 'platform_budget'
}

/**
 * How much one run may do. The monthly AI cap and the platform budget hard
 * stop only switch AI off (each loop has a deterministic fallback); the daily
 * item cap stops the run. Pure.
 */
export function loopBudget(s: Pick<LoopSettings, 'daily_item_cap' | 'monthly_cost_cap_usd'>, usedToday: number, spentMonthUsd: number, platformStopped: boolean): LoopBudget {
  const left = Math.max(0, s.daily_item_cap - Math.max(0, usedToday))
  const ai_off = platformStopped ? 'platform_budget' as const : spentMonthUsd >= s.monthly_cost_cap_usd ? 'monthly_cap' as const : undefined
  return { items: left, ai: !ai_off, ...(left === 0 ? { blocked: 'daily_cap' as const } : {}), ...(ai_off ? { ai_off } : {}) }
}

/** Is the scheduled run of `loop` due at `now`? Pure. */
export function loopDue(loop: LoopId, s: Pick<LoopSettings, 'enabled' | 'run_hour_utc'>, now: Date): boolean {
  if (!s.enabled) return false
  if (loop === 'sourcer') return now.getUTCHours() >= s.run_hour_utc
  return true
}

/** The claim window for a scheduled run (one run per window per organisation). Pure. */
export function loopWindow(loop: LoopId, now: Date): string {
  const iso = now.toISOString()
  if (loop === 'sourcer') return iso.slice(0, 10)
  if (loop === 'author') return `${iso.slice(0, 13)}q${Math.floor(now.getUTCMinutes() / 15)}`
  return iso.slice(0, 13)
}

export type RunStatus = 'running' | 'ok' | 'partial' | 'failed' | 'skipped' | 'blocked'

export interface RunItem {
  kind: string
  /** Job / interview / request / attempt id this item is about. */
  ref: string
  title: string
  action_id?: string | null
  auto_sent?: boolean
  result?: string | null
  note?: string | null
}
