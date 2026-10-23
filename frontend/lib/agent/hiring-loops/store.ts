/**
 * Hiring agent persistence (server only). Every row carries tenant_id and
 * every read filters by it.
 *
 * Collections:
 *   hiring_agent_settings          {_id: "<tenant>:<loop>"} settings + owner + manual-run claim
 *   hiring_agent_runs              one row per run (run log): items, counts, AI cost; unique run_key per scheduled window
 *   hiring_agent_state             {_id: "<tenant>:<loop>:<ref>"} per job / interview memory (last sourced, offers)
 *   hiring_agent_author_requests   JD → test requests (queue)
 *   hiring_agent_cases             integrity review queue (one row per tenant + target + candidate)
 */
import 'server-only'
import type { Collection, Db } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ids'
import { logger } from '@/lib/logger'
import { mergeSettings, type LoopId, type LoopSettings, type RunItem, type RunStatus, type SettingsPatch } from './types'

export interface SettingsDoc {
  _id: string
  tenant_id: string
  loop: LoopId
  enabled?: boolean
  auto_send?: Record<string, boolean>
  daily_item_cap?: number
  monthly_cost_cap_usd?: number
  run_hour_utc?: number
  params?: Record<string, unknown>
  /** The admin the loop's proposals belong to (who last switched it on). */
  owner_id?: string | null
  owner_name?: string | null
  running_until?: string | null
  updated_at?: string
  updated_by?: string | null
}

export interface RunDoc {
  id: string
  run_key?: string | null
  tenant_id: string
  loop: LoopId
  trigger: 'cron' | 'manual'
  by: string | null
  status: RunStatus
  started_at: string
  finished_at?: string
  day: string
  month: string
  items: RunItem[]
  /** Items that count against the daily cap (proposals + auto-sent). */
  item_count: number
  cost_usd: number
  ai_off?: string | null
  conversation_id?: string | null
  message?: string
}

export interface StateDoc { _id: string; tenant_id: string; loop: LoopId; ref: string; data: Record<string, unknown>; updated_at: string }

export interface AuthorRequestDoc {
  id: string
  tenant_id: string
  created_by: string
  job_id: string | null
  jd_text: string | null
  title: string | null
  status: 'queued' | 'working' | 'proposed' | 'failed' | 'gave_up'
  attempts: number
  lease_until?: string | null
  action_id?: string | null
  message?: string | null
  report?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface CaseDoc {
  _id: string
  tenant_id: string
  target_kind: 'exam' | 'contest'
  target_id: string
  target_title: string
  user_id: string
  name: string
  attempt_id: string | null
  priority: number
  recommendation: 'hold' | 'release_hold' | 'none'
  facts: string[]
  summary: string
  summary_locale: string
  ai_summary?: string | null
  held: boolean
  released: boolean
  action_id?: string | null
  updated_at: string
}

let indexed: Promise<unknown> | null = null
async function db(): Promise<Db> {
  const d = await getMongoDb()
  if (!indexed) {
    indexed = Promise.all([
      d.collection('hiring_agent_settings').createIndex({ loop: 1, enabled: 1 }),
      d.collection('hiring_agent_runs').createIndex({ id: 1 }, { unique: true }),
      d.collection('hiring_agent_runs').createIndex({ run_key: 1 }, { unique: true, partialFilterExpression: { run_key: { $type: 'string' } } }),
      d.collection('hiring_agent_runs').createIndex({ tenant_id: 1, started_at: -1 }),
      d.collection('hiring_agent_runs').createIndex({ tenant_id: 1, loop: 1, day: 1 }),
      d.collection('hiring_agent_runs').createIndex({ tenant_id: 1, loop: 1, month: 1 }),
      d.collection('hiring_agent_state').createIndex({ tenant_id: 1, loop: 1, updated_at: -1 }),
      d.collection('hiring_agent_author_requests').createIndex({ id: 1 }, { unique: true }),
      d.collection('hiring_agent_author_requests').createIndex({ tenant_id: 1, created_at: -1 }),
      d.collection('hiring_agent_author_requests').createIndex({ status: 1, created_at: 1 }),
      d.collection('hiring_agent_cases').createIndex({ tenant_id: 1, priority: -1 }),
      d.collection('hiring_agent_cases').createIndex({ tenant_id: 1, target_id: 1 }),
    ]).catch((e) => {
      indexed = null
      logger.warn(`[hiring-agents] index setup: ${(e as Error).message}`)
    })
  }
  return d
}

const c = async <T extends object>(name: string): Promise<Collection<T>> => (await db()).collection<T>(name)
export const settingsCol = () => c<SettingsDoc>('hiring_agent_settings')
export const runsCol = () => c<RunDoc>('hiring_agent_runs')
export const stateCol = () => c<StateDoc>('hiring_agent_state')
export const authorRequests = () => c<AuthorRequestDoc>('hiring_agent_author_requests')
export const casesCol = () => c<CaseDoc>('hiring_agent_cases')

export const dayKey = (d: Date) => d.toISOString().slice(0, 10)
export const monthKey = (d: Date) => d.toISOString().slice(0, 7)
const sid = (tenantId: string, loop: LoopId) => `${tenantId}:${loop}`

// ─── Settings ───────────────────────────────────────────────────────────────

export interface LoadedSettings<L extends LoopId = LoopId> { settings: LoopSettings<L>; owner_id: string | null; owner_name: string | null; updated_at: string | null }

export async function getLoopSettings<L extends LoopId>(tenantId: string, loop: L): Promise<LoadedSettings<L>> {
  const doc = await (await settingsCol()).findOne({ _id: sid(tenantId, loop) })
  return { settings: mergeSettings(loop, doc), owner_id: doc?.owner_id ?? null, owner_name: doc?.owner_name ?? null, updated_at: doc?.updated_at ?? null }
}

/** Save a validated patch. Switching on (or saving while on) makes `actor` the owner of new proposals. */
export async function saveLoopSettings(tenantId: string, loop: LoopId, patch: SettingsPatch, actor: { id: string; name?: string | null }): Promise<LoadedSettings> {
  const cur = await getLoopSettings(tenantId, loop)
  const next = mergeSettings(loop, {
    ...cur.settings,
    ...patch,
    auto_send: { ...cur.settings.auto_send, ...(patch.auto_send ?? {}) },
    params: { ...cur.settings.params, ...(patch.params ?? {}) },
  })
  const becomesOwner = next.enabled && (patch.enabled === true || !cur.owner_id)
  await (await settingsCol()).updateOne(
    { _id: sid(tenantId, loop) },
    {
      $set: {
        tenant_id: tenantId, loop, ...next, updated_at: nowIso(), updated_by: actor.id,
        ...(becomesOwner ? { owner_id: actor.id, owner_name: String(actor.name || '').slice(0, 120) || null } : {}),
      } as never,
    },
    { upsert: true },
  )
  return getLoopSettings(tenantId, loop)
}

/** Switch a loop off (owner lost access). */
export async function disableLoop(tenantId: string, loop: LoopId): Promise<void> {
  await (await settingsCol()).updateOne({ _id: sid(tenantId, loop) }, { $set: { enabled: false, updated_at: nowIso(), updated_by: 'system' } })
}

/** Organisations with this loop switched on explicitly. */
export async function enabledTenants(loop: LoopId, limit = 500): Promise<string[]> {
  const rows = await (await settingsCol()).find({ loop, enabled: true }, { projection: { tenant_id: 1 } }).limit(limit).toArray()
  return rows.map((r) => r.tenant_id)
}

/** Organisations that switched this loop off explicitly (for default-on loops). */
export async function disabledTenants(loop: LoopId): Promise<Set<string>> {
  const rows = await (await settingsCol()).find({ loop, enabled: false }, { projection: { tenant_id: 1 } }).limit(5000).toArray()
  return new Set(rows.map((r) => r.tenant_id))
}

/** One manual run at a time per organisation + loop (across replicas). */
export async function claimManual(tenantId: string, loop: LoopId, now = new Date()): Promise<boolean> {
  const until = new Date(now.getTime() + 10 * 60_000).toISOString()
  try {
    const r = await (await settingsCol()).updateOne(
      { _id: sid(tenantId, loop), $or: [{ running_until: null }, { running_until: { $exists: false } }, { running_until: { $lt: now.toISOString() } }] },
      { $set: { running_until: until, tenant_id: tenantId, loop } },
      { upsert: true },
    )
    return r.modifiedCount === 1 || !!r.upsertedId
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return false
    throw e
  }
}
export async function releaseManual(tenantId: string, loop: LoopId): Promise<void> {
  await (await settingsCol()).updateOne({ _id: sid(tenantId, loop) }, { $set: { running_until: null } }).catch(() => undefined)
}

// ─── Runs ───────────────────────────────────────────────────────────────────

/** Start a run; null when a scheduled run already exists for this window. */
export async function startRun(input: Omit<RunDoc, 'id' | 'status' | 'items' | 'item_count' | 'cost_usd' | 'day' | 'month' | 'started_at'> & { now: Date }): Promise<RunDoc | null> {
  const { now, ...rest } = input
  const doc: RunDoc = { id: newId(), ...rest, status: 'running', started_at: now.toISOString(), day: dayKey(now), month: monthKey(now), items: [], item_count: 0, cost_usd: 0 }
  try {
    await (await runsCol()).insertOne({ ...doc })
    return doc
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return null
    throw e
  }
}

export async function saveRun(id: string, patch: Partial<RunDoc>): Promise<void> {
  await (await runsCol()).updateOne({ id }, { $set: patch })
}

export async function usageSoFar(tenantId: string, loop: LoopId, now: Date): Promise<{ itemsToday: number; spentMonth: number }> {
  const col = await runsCol()
  const [today, month] = await Promise.all([
    col.aggregate<{ n: number }>([{ $match: { tenant_id: tenantId, loop, day: dayKey(now) } }, { $group: { _id: null, n: { $sum: '$item_count' } } }]).toArray(),
    col.aggregate<{ usd: number }>([{ $match: { tenant_id: tenantId, loop, month: monthKey(now) } }, { $group: { _id: null, usd: { $sum: '$cost_usd' } } }]).toArray(),
  ])
  return { itemsToday: today[0]?.n ?? 0, spentMonth: Math.round((month[0]?.usd ?? 0) * 1e6) / 1e6 }
}

export async function listRuns(tenantId: string, limit = 40): Promise<RunDoc[]> {
  return (await (await runsCol()).find({ tenant_id: tenantId }, { projection: { _id: 0 } }).sort({ started_at: -1 }).limit(Math.min(100, limit)).toArray()) as RunDoc[]
}

export async function lastRuns(tenantId: string): Promise<Partial<Record<LoopId, RunDoc>>> {
  const rows = await (await runsCol()).aggregate<RunDoc & { _id: LoopId }>([
    { $match: { tenant_id: tenantId } }, { $sort: { started_at: -1 } },
    { $group: { _id: '$loop', doc: { $first: '$$ROOT' } } }, { $replaceRoot: { newRoot: { $mergeObjects: ['$doc', { _id: '$_id' }] } } },
  ]).toArray()
  const out: Partial<Record<LoopId, RunDoc>> = {}
  for (const r of rows) { const { _id, ...rest } = r as RunDoc & { _id: unknown }; void _id; out[r.loop] = rest as RunDoc }
  return out
}

// ─── State ──────────────────────────────────────────────────────────────────

export async function getStates(tenantId: string, loop: LoopId, refs: string[]): Promise<Map<string, Record<string, unknown>>> {
  if (!refs.length) return new Map()
  const rows = await (await stateCol()).find({ _id: { $in: refs.map((r) => `${tenantId}:${loop}:${r}`) } }).toArray()
  return new Map(rows.map((r) => [r.ref, r.data]))
}

export async function setState(tenantId: string, loop: LoopId, ref: string, data: Record<string, unknown>): Promise<void> {
  await (await stateCol()).updateOne(
    { _id: `${tenantId}:${loop}:${ref}` },
    { $set: { tenant_id: tenantId, loop, ref, data, updated_at: nowIso() } },
    { upsert: true },
  )
}
