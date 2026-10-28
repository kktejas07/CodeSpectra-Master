/**
 * Copilot usage ledger + budget persistence (server only).
 *
 * Collections:
 *   agent_settings   { key: 'budget', value: AgentBudgetSettings }
 *   agent_usage      one row per turn / metered action: tokens, cost, credits, status
 *   agent_usage_agg  counters { id: `${tenant}:${period}`, tenant_key, period, kind: 'day'|'month', tokens, cost_usd, credits, turns }
 *
 * The analytics part reads usage through `agentUsageReport()` (also exposed at
 * GET /api/admin/agent/usage).
 */
import 'server-only'
import { getMongoDb } from '@/lib/mongodb'
import type { AgentCaller } from '@/lib/agent/contract'
import {
  DEFAULT_BUDGET, budgetKey, budgetState, dayKey, limitsFor, monthKey, sanitizeBudget, withPlatformHardStop,
  type AgentBudgetSettings, type BudgetState,
} from './budget'
import type { TurnCharge } from './metering'

const SETTINGS = 'agent_settings'
const USAGE = 'agent_usage'
const AGG = 'agent_usage_agg'

let cache: { at: number; value: AgentBudgetSettings } | null = null
let indexes: Promise<unknown> | null = null

async function db() {
  const d = await getMongoDb()
  if (!indexes) {
    indexes = Promise.all([
      d.collection(USAGE).createIndex({ tenant_key: 1, created_at: -1 }, { name: 'agent_usage_tenant_time' }),
      d.collection(USAGE).createIndex({ user_id: 1, created_at: -1 }, { name: 'agent_usage_user_time' }),
      d.collection(AGG).createIndex({ tenant_key: 1, kind: 1, period: -1 }, { name: 'agent_usage_agg_tenant' }),
    ]).catch((e) => { indexes = null; console.error('[agent/usage] index build failed', e) })
  }
  return d
}

export async function getBudgetSettings(): Promise<AgentBudgetSettings> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value
  try {
    const row = await (await db()).collection(SETTINGS).findOne({ key: 'budget' }, { projection: { _id: 0, value: 1 } })
    const value = sanitizeBudget(row?.value ?? {}, DEFAULT_BUDGET)
    cache = { at: Date.now(), value }
    return value
  } catch {
    return DEFAULT_BUDGET
  }
}

export async function saveBudgetSettings(patch: unknown, actorId: string): Promise<AgentBudgetSettings> {
  const next = sanitizeBudget(patch, await getBudgetSettings())
  await (await db()).collection(SETTINGS).updateOne(
    { key: 'budget' },
    { $set: { key: 'budget', value: next, updated_at: new Date().toISOString(), updated_by: actorId } },
    { upsert: true },
  )
  cache = { at: Date.now(), value: next }
  return next
}

async function counters(key: string, now: Date): Promise<{ day: number; month: number }> {
  const rows = await (await db()).collection(AGG)
    .find({ id: { $in: [`${key}:${dayKey(now)}`, `${key}:${monthKey(now)}`] } }, { projection: { _id: 0, id: 1, tokens: 1 } })
    .toArray()
  const get = (id: string) => Number(rows.find((r) => r.id === id)?.tokens) || 0
  return { day: get(`${key}:${dayKey(now)}`), month: get(`${key}:${monthKey(now)}`) }
}

/** Budget left for the organisation this caller acts in. Fails open (with a log) when the DB can't be read. */
export async function checkBudget(caller: AgentCaller, now = new Date()): Promise<BudgetState> {
  const settings = await getBudgetSettings()
  const key = budgetKey(caller)
  try {
    const state = budgetState(await counters(key, now), limitsFor(key, settings))
    // AGT-028: honour the platform AI money hard stop as well (never throws; fails open).
    const { aiBudgetBlocks } = await import('@/lib/ai/usage-record')
    return withPlatformHardStop(state, await aiBudgetBlocks('admin_agent'))
  } catch (e) {
    console.error('[agent/usage] budget read failed:', e)
    return { ok: true, remaining: settings.max_tokens_per_turn, daily: { used: 0, limit: 0 }, monthly: { used: 0, limit: 0 } }
  }
}

export interface UsageRecordInput {
  caller: AgentCaller
  /** The session user who pays credits (owner of the conversation). */
  payerId: string
  conversationId: string | null
  kind: 'turn' | 'edit' | 'confirm' | 'summary'
  status: string
  charge: TurnCharge
  creditsCharged: number
  toolCalls?: number
}

/** Append the ledger row and bump the day + month counters. Never throws. */
export async function recordUsage(r: UsageRecordInput, now = new Date()): Promise<void> {
  try {
    const d = await db()
    const key = budgetKey(r.caller)
    const tokens = r.charge.inputTokens + r.charge.outputTokens
    await d.collection(USAGE).insertOne({
      id: globalThis.crypto.randomUUID(),
      tenant_key: key,
      user_id: r.payerId,
      role: r.caller.role,
      conversation_id: r.conversationId,
      kind: r.kind,
      status: r.status,
      input_tokens: r.charge.inputTokens,
      output_tokens: r.charge.outputTokens,
      tokens,
      cost_usd: r.charge.costUsd,
      credits: r.creditsCharged,
      credits_due: r.charge.credits,
      by_kind: r.charge.byKind,
      models: r.charge.models,
      tool_calls: r.toolCalls ?? 0,
      created_at: now.toISOString(),
    })
    const inc = { tokens, cost_usd: r.charge.costUsd, credits: r.creditsCharged, turns: r.kind === 'turn' ? 1 : 0 }
    for (const [kind, period] of [['day', dayKey(now)], ['month', monthKey(now)]] as const) {
      await d.collection(AGG).updateOne(
        { id: `${key}:${period}` },
        { $inc: inc, $setOnInsert: { id: `${key}:${period}`, tenant_key: key, kind, period } },
        { upsert: true },
      )
    }
  } catch (e) {
    console.error('[agent/usage] record failed:', e)
  }
}

export interface UsageReport {
  tenant_key: string | null
  since: string
  totals: { tokens: number; cost_usd: number; credits: number; turns: number }
  daily: { day: string; tokens: number; cost_usd: number; credits: number; turns: number }[]
  by_status: Record<string, number>
  top_users: { user_id: string; tokens: number; credits: number; turns: number }[]
  by_tenant?: { tenant_key: string; tokens: number; cost_usd: number; credits: number; turns: number }[]
  budget?: BudgetState
  settings?: AgentBudgetSettings
}

/** Usage numbers for dashboards (tenant admins: own organisation only — enforced by the caller). */
export async function agentUsageReport(opts: { tenantKey: string | null; days?: number; now?: Date }): Promise<UsageReport> {
  const now = opts.now ?? new Date()
  const days = Math.max(1, Math.min(366, Math.floor(opts.days ?? 30)))
  const since = new Date(now.getTime() - days * 86_400_000)
  const d = await db()
  const match: Record<string, unknown> = { created_at: { $gte: since.toISOString() }, ...(opts.tenantKey ? { tenant_key: opts.tenantKey } : {}) }
  const sum = { tokens: { $sum: '$tokens' }, cost_usd: { $sum: '$cost_usd' }, credits: { $sum: '$credits' }, turns: { $sum: { $cond: [{ $eq: ['$kind', 'turn'] }, 1, 0] } } }
  const [daily, statuses, users, tenants] = await Promise.all([
    d.collection(USAGE).aggregate<{ _id: string; tokens: number; cost_usd: number; credits: number; turns: number }>([
      { $match: match }, { $group: { _id: { $substrBytes: ['$created_at', 0, 10] }, ...sum } }, { $sort: { _id: 1 } },
    ]).toArray(),
    d.collection(USAGE).aggregate<{ _id: string; n: number }>([{ $match: match }, { $group: { _id: '$status', n: { $sum: 1 } } }]).toArray(),
    d.collection(USAGE).aggregate<{ _id: string; tokens: number; credits: number; turns: number }>([
      { $match: match }, { $group: { _id: '$user_id', ...sum } }, { $sort: { tokens: -1 } }, { $limit: 10 },
    ]).toArray(),
    opts.tenantKey ? Promise.resolve([]) : d.collection(USAGE).aggregate<{ _id: string; tokens: number; cost_usd: number; credits: number; turns: number }>([
      { $match: match }, { $group: { _id: '$tenant_key', ...sum } }, { $sort: { tokens: -1 } }, { $limit: 50 },
    ]).toArray(),
  ])
  const round = (n: number) => Math.round(n * 1e4) / 1e4
  const totals = daily.reduce((a, r) => ({ tokens: a.tokens + r.tokens, cost_usd: a.cost_usd + r.cost_usd, credits: a.credits + r.credits, turns: a.turns + r.turns }), { tokens: 0, cost_usd: 0, credits: 0, turns: 0 })
  return {
    tenant_key: opts.tenantKey,
    since: since.toISOString(),
    totals: { ...totals, cost_usd: round(totals.cost_usd) },
    daily: daily.map((r) => ({ day: r._id, tokens: r.tokens, cost_usd: round(r.cost_usd), credits: r.credits, turns: r.turns })),
    by_status: Object.fromEntries(statuses.map((s) => [s._id || 'unknown', s.n])),
    top_users: users.map((u) => ({ user_id: u._id, tokens: u.tokens, credits: u.credits, turns: u.turns })),
    ...(opts.tenantKey ? {} : { by_tenant: tenants.map((t) => ({ tenant_key: t._id, tokens: t.tokens, cost_usd: round(t.cost_usd), credits: t.credits, turns: t.turns })) }),
  }
}
