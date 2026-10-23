/**
 * Assistants (wave 15) — the five agents built on the copilot framework, their
 * switches, caps and job ids. Pure and client-safe; server code is in ./store.
 *
 *   support        In-app help chat for learners and company users (/dashboard/support):
 *                  public docs + the signed-in user's own records, escalation to a ticket.
 *   org_onboarding Setup checklist for new company / college admins (/dashboard/admin/onboarding)
 *                  with copilot proposals per step; optional nudge e-mails.
 *   placement      Copilot specialist for college placement teams (readiness, nudges, shortlists,
 *                  company practice) + an optional weekly placement report.
 *   mentor_match   Mentor suggestions from the study plan (/dashboard/study-plan) + an optional
 *                  follow-up after each mentor session.
 *   revenue        Daily scan of subscriptions, licences and plan usage → renewal / upgrade /
 *                  win-back proposals in a superadmin's copilot (nothing is sent until confirmed).
 *
 * Default ON only for read-only insights that spend nothing (checklist, mentor suggestions,
 * revenue scan → proposals only). Anything that messages people or spends AI money is OFF.
 */
import { z } from 'zod'

export const ASSISTANT_IDS = ['support', 'org_onboarding', 'placement', 'mentor_match', 'revenue'] as const
export type AssistantId = (typeof ASSISTANT_IDS)[number]
export const isAssistantId = (v: unknown): v is AssistantId => typeof v === 'string' && (ASSISTANT_IDS as readonly string[]).includes(v)

export interface AssistantSettings {
  /** The agent itself (support chat answers, checklist page, suggestions, revenue scan). */
  enabled: boolean
  /** Use the model (support only). Off → deterministic answers from docs search + the user's records. */
  ai_enabled: boolean
  /** Model calls per UTC day, all users together. */
  daily_ai_cap: number
  /** Monthly spend cap in USD for this assistant's AI feature. */
  monthly_cost_cap_usd: number
  /** Outbound messages from the scheduled loop (onboarding nudges, weekly report, mentor follow-ups). */
  messaging_enabled: boolean
  /** Support: questions per user per UTC day. */
  per_user_daily: number
  /** Revenue: renew / expiry window in days. */
  window_days: number
  /** Revenue / onboarding: don't repeat the same proposal or nudge within N days. */
  cooldown_days: number
  /** Revenue: at most this many proposals per run. */
  max_proposals: number
  /** Superadmin whose copilot receives loop proposals (set when an admin switches the agent on). */
  owner_id: string | null
}

const BASE: AssistantSettings = {
  enabled: false, ai_enabled: false, daily_ai_cap: 0, monthly_cost_cap_usd: 0, messaging_enabled: false,
  per_user_daily: 0, window_days: 0, cooldown_days: 0, max_proposals: 0, owner_id: null,
}

export const DEFAULT_ASSISTANT_SETTINGS: Record<AssistantId, AssistantSettings> = {
  // Spends AI money on every question → off until an admin switches it on.
  support: { ...BASE, enabled: false, ai_enabled: true, daily_ai_cap: 300, monthly_cost_cap_usd: 5, per_user_daily: 30 },
  // Read-only checklist on; nudge e-mails off.
  org_onboarding: { ...BASE, enabled: true, cooldown_days: 3 },
  // Copilot tools always follow the admin's own permissions; the weekly report e-mail is off.
  placement: { ...BASE, enabled: true },
  // Suggestions on; follow-up messages off.
  mentor_match: { ...BASE, enabled: true },
  // Scan + proposals only (a human confirms every send / coupon) → on; nothing leaves without a click.
  revenue: { ...BASE, enabled: true, window_days: 14, cooldown_days: 14, max_proposals: 10 },
}

export interface AssistantMeta {
  id: AssistantId
  kind: 'bot' | 'loop' | 'specialist'
  /** recordAiUsage feature name (only assistants that call a model). */
  ai_feature: string | null
  /** Scheduled job id (lib/automation/job-registry.ts), when the assistant has a loop. */
  job_id: string | null
  /** Which settings the admin page shows. */
  fields: (keyof AssistantSettings)[]
}

export const ASSISTANTS: readonly AssistantMeta[] = [
  { id: 'support', kind: 'bot', ai_feature: 'assistant-support', job_id: null, fields: ['enabled', 'ai_enabled', 'daily_ai_cap', 'monthly_cost_cap_usd', 'per_user_daily'] },
  { id: 'org_onboarding', kind: 'bot', ai_feature: null, job_id: 'assistant-onboarding', fields: ['enabled', 'messaging_enabled', 'cooldown_days'] },
  { id: 'placement', kind: 'specialist', ai_feature: null, job_id: 'assistant-placement-report', fields: ['enabled', 'messaging_enabled'] },
  { id: 'mentor_match', kind: 'bot', ai_feature: null, job_id: 'assistant-mentor-followup', fields: ['enabled', 'messaging_enabled'] },
  { id: 'revenue', kind: 'loop', ai_feature: null, job_id: 'assistant-revenue', fields: ['enabled', 'window_days', 'cooldown_days', 'max_proposals'] },
]

export const assistantMeta = (id: AssistantId): AssistantMeta => ASSISTANTS.find((a) => a.id === id)!

export const AssistantSettingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  ai_enabled: z.boolean().optional(),
  daily_ai_cap: z.coerce.number().int().min(0).max(10_000).optional(),
  monthly_cost_cap_usd: z.coerce.number().min(0).max(1000).optional(),
  messaging_enabled: z.boolean().optional(),
  per_user_daily: z.coerce.number().int().min(1).max(500).optional(),
  window_days: z.coerce.number().int().min(1).max(90).optional(),
  cooldown_days: z.coerce.number().int().min(1).max(90).optional(),
  max_proposals: z.coerce.number().int().min(1).max(50).optional(),
}).strict()
export type AssistantSettingsPatch = z.infer<typeof AssistantSettingsPatchSchema>

/** Validate an admin patch; only the fields this assistant shows are accepted. Pure. */
export function cleanAssistantPatch(id: AssistantId, raw: unknown): { ok: true; patch: AssistantSettingsPatch } | { ok: false; error: string } {
  const r = AssistantSettingsPatchSchema.safeParse(raw)
  if (!r.success) {
    const i = r.error.issues[0]
    return { ok: false, error: i ? `${i.path.join('.') || 'settings'}: ${i.message}` : 'Invalid settings' }
  }
  const allowed = new Set<string>(assistantMeta(id).fields)
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(r.data)) {
    if (v === undefined) continue
    if (!allowed.has(k)) return { ok: false, error: `${k}: not a setting of this assistant` }
    patch[k] = k === 'monthly_cost_cap_usd' ? Math.round(Number(v) * 100) / 100 : v
  }
  return { ok: true, patch: patch as AssistantSettingsPatch }
}

/** Stored (partial / invalid) settings → full settings. Pure. */
export function mergeAssistantSettings(id: AssistantId, raw: unknown): AssistantSettings {
  const d = DEFAULT_ASSISTANT_SETTINGS[id]
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const { owner_id, ...rest } = obj
  // Field by field: one bad stored value falls back alone instead of resetting everything.
  const shape = AssistantSettingsPatchSchema.shape as Record<string, z.ZodTypeAny>
  const p: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rest)) {
    if (!(k in shape)) continue
    const r = shape[k].safeParse(v)
    if (r.success && r.data !== undefined) p[k] = r.data
  }
  return { ...d, ...p, owner_id: typeof owner_id === 'string' && owner_id ? owner_id : null }
}

export type AiBlock = 'off' | 'daily_cap' | 'monthly_cap' | 'budget'

/** Why the model may not be used now, or null. Pure. */
export function assistantAiBlocked(s: Pick<AssistantSettings, 'ai_enabled' | 'daily_ai_cap' | 'monthly_cost_cap_usd'>, callsToday: number, spentThisMonthUsd: number, budgetBlocked = false): AiBlock | null {
  if (!s.ai_enabled) return 'off'
  if (budgetBlocked) return 'budget'
  if (spentThisMonthUsd >= s.monthly_cost_cap_usd) return 'monthly_cap'
  if (callsToday >= s.daily_ai_cap) return 'daily_cap'
  return null
}

/** Run log row (collection `assistant_runs`). No PII: ids and counts only. */
export interface AssistantRunRow {
  id: string
  assistant: AssistantId
  trigger: 'user' | 'cron' | 'manual' | 'copilot'
  status: 'ok' | 'partial' | 'failed' | 'skipped'
  started_at: string
  finished_at: string | null
  /** Short English summary for the admin ("3 proposals, 1 skipped (cooldown)"). */
  message: string
  counts: Record<string, number>
  /** Tenant the run acted for, when it was scoped to one. */
  tenant_id: string | null
  /** Opaque, non-reversible reference to the user (support chat), never an email. */
  user_ref?: string | null
  ai?: { used: boolean; fallback: string | null } | null
}
