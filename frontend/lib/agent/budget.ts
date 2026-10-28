/**
 * Copilot budgets (AGT-001): per-organisation daily + monthly token budgets,
 * per-user message rate limits and the credit conversion — all admin-configurable.
 * Pure helpers here; persistence in lib/agent/usage.ts.
 *
 * Tenant key: the organisation the turn acts in (a superadmin scoped to a
 * tenant spends that tenant's budget; platform-wide = '_platform').
 */
import type { AgentCaller } from '@/lib/agent/contract'
import { DEFAULT_METER, type MeterConfig } from './metering'

export const PLATFORM_KEY = '_platform'

export interface AgentBudgetSettings {
  meter: MeterConfig
  /** Organisation budgets in tokens (0 = unlimited). */
  tenant_daily_tokens: number
  tenant_monthly_tokens: number
  /** Platform-wide (superadmin, no tenant) budgets. */
  platform_daily_tokens: number
  platform_monthly_tokens: number
  /** Per-user message rate limits. */
  user_messages_per_minute: number
  user_messages_per_hour: number
  /** Per-turn caps. */
  max_steps_per_turn: number
  max_tokens_per_turn: number
  /** Per-tenant overrides. */
  tenant_overrides: Record<string, { daily_tokens?: number; monthly_tokens?: number }>
}

export const DEFAULT_BUDGET: AgentBudgetSettings = {
  meter: DEFAULT_METER,
  tenant_daily_tokens: 2_000_000,
  tenant_monthly_tokens: 30_000_000,
  platform_daily_tokens: 5_000_000,
  platform_monthly_tokens: 100_000_000,
  user_messages_per_minute: 12,
  user_messages_per_hour: 150,
  max_steps_per_turn: 10,
  max_tokens_per_turn: 150_000,
  tenant_overrides: {},
}

const int = (v: unknown, min: number, max: number, def: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, Math.floor(n)))
}
const num = (v: unknown, min: number, max: number, def: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, n))
}

const TENANT_RE = /^[A-Za-z0-9_-]{1,80}$/

/** Validate + merge a (partial) settings object over a base. Unknown keys are dropped. */
export function sanitizeBudget(raw: unknown, base: AgentBudgetSettings = DEFAULT_BUDGET): AgentBudgetSettings {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const m = (r.meter && typeof r.meter === 'object' ? r.meter : {}) as Record<string, unknown>
  const overrides: AgentBudgetSettings['tenant_overrides'] = { ...base.tenant_overrides }
  if (r.tenant_overrides && typeof r.tenant_overrides === 'object' && !Array.isArray(r.tenant_overrides)) {
    for (const [tid, v] of Object.entries(r.tenant_overrides as Record<string, unknown>)) {
      if (!TENANT_RE.test(tid)) continue
      if (v === null) { delete overrides[tid]; continue }
      if (!v || typeof v !== 'object') continue
      const o = v as Record<string, unknown>
      overrides[tid] = {
        ...(o.daily_tokens !== undefined ? { daily_tokens: int(o.daily_tokens, 0, 1e10, 0) } : {}),
        ...(o.monthly_tokens !== undefined ? { monthly_tokens: int(o.monthly_tokens, 0, 1e11, 0) } : {}),
      }
    }
  }
  return {
    meter: {
      tokensPerCredit: int(m.tokensPerCredit, 1000, 10_000_000, base.meter.tokensPerCredit),
      usdPerCredit: num(m.usdPerCredit, 0, 100, base.meter.usdPerCredit),
    },
    tenant_daily_tokens: int(r.tenant_daily_tokens, 0, 1e10, base.tenant_daily_tokens),
    tenant_monthly_tokens: int(r.tenant_monthly_tokens, 0, 1e11, base.tenant_monthly_tokens),
    platform_daily_tokens: int(r.platform_daily_tokens, 0, 1e10, base.platform_daily_tokens),
    platform_monthly_tokens: int(r.platform_monthly_tokens, 0, 1e11, base.platform_monthly_tokens),
    user_messages_per_minute: int(r.user_messages_per_minute, 1, 120, base.user_messages_per_minute),
    user_messages_per_hour: int(r.user_messages_per_hour, 1, 5000, base.user_messages_per_hour),
    max_steps_per_turn: int(r.max_steps_per_turn, 2, 16, base.max_steps_per_turn),
    max_tokens_per_turn: int(r.max_tokens_per_turn, 10_000, 1_000_000, base.max_tokens_per_turn),
    tenant_overrides: overrides,
  }
}

export function budgetKey(caller: Pick<AgentCaller, 'tenantId'>): string {
  return caller.tenantId && TENANT_RE.test(caller.tenantId) ? caller.tenantId : PLATFORM_KEY
}

export function limitsFor(key: string, s: AgentBudgetSettings): { daily: number; monthly: number } {
  if (key === PLATFORM_KEY) return { daily: s.platform_daily_tokens, monthly: s.platform_monthly_tokens }
  const o = s.tenant_overrides[key] ?? {}
  return { daily: o.daily_tokens ?? s.tenant_daily_tokens, monthly: o.monthly_tokens ?? s.tenant_monthly_tokens }
}

export interface BudgetState {
  ok: boolean
  /** Tokens this turn may still use (Infinity when unlimited). */
  remaining: number
  reason?: string
  daily: { used: number; limit: number }
  monthly: { used: number; limit: number }
}

/** Is there budget left? 0 limit = unlimited. Pure. */
export function budgetState(used: { day: number; month: number }, limits: { daily: number; monthly: number }): BudgetState {
  const leftDay = limits.daily > 0 ? limits.daily - used.day : Infinity
  const leftMonth = limits.monthly > 0 ? limits.monthly - used.month : Infinity
  const remaining = Math.min(leftDay, leftMonth)
  const daily = { used: used.day, limit: limits.daily }
  const monthly = { used: used.month, limit: limits.monthly }
  if (leftMonth <= 0) return { ok: false, remaining: 0, reason: 'Your organisation has used its AI copilot budget for this month. A platform admin can raise it in the copilot usage settings.', daily, monthly }
  if (leftDay <= 0) return { ok: false, remaining: 0, reason: 'Your organisation has used today\'s AI copilot budget. It resets at midnight UTC, or a platform admin can raise it.', daily, monthly }
  return { ok: true, remaining, daily, monthly }
}

/**
 * AGT-028: the platform-wide AI money hard stop (Admin -> AI spend) also pauses the copilot when
 * 'admin_agent' is on the non-critical list and the monthly budget is used up. Pure.
 */
export const PLATFORM_HARD_STOP_REASON = 'The platform\'s monthly AI budget is used up, so the copilot is paused until next month or until a superadmin raises the budget.'
export function withPlatformHardStop(state: BudgetState, blocked: boolean): BudgetState {
  return blocked ? { ...state, ok: false, remaining: 0, reason: PLATFORM_HARD_STOP_REASON } : state
}

export const dayKey = (d: Date) => d.toISOString().slice(0, 10)
export const monthKey = (d: Date) => d.toISOString().slice(0, 7)
