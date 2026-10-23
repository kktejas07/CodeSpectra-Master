/**
 * Assistants persistence (server only).
 *
 *   assistant_settings  { _id: AssistantId, ...AssistantSettings, updated_at, updated_by }
 *   assistant_runs      AssistantRunRow — the admin run log (TTL 90 days)
 *   assistant_counters  { id, n, expires_at } — daily AI calls, per-user question counts (TTL)
 *   assistant_marks     { key, assistant, at, expires_at } — "already did this" marks for
 *                       idempotent loops / cooldowns (unique key, TTL)
 */
import 'server-only'
import { createHash } from 'node:crypto'
import { lazyCollection } from '@/lib/community/lazy'
import { newId, nowIso } from '@/lib/db/ids'
import {
  ASSISTANT_IDS, assistantAiBlocked, assistantMeta, mergeAssistantSettings,
  type AiBlock, type AssistantId, type AssistantRunRow, type AssistantSettings, type AssistantSettingsPatch,
} from './registry'

const DAY = 86_400_000

interface SettingsDoc { _id: string; updated_at?: string; updated_by?: string; [k: string]: unknown }
interface CounterDoc { id: string; n: number; expires_at: Date }
interface MarkDoc { key: string; assistant: AssistantId; at: string; expires_at: Date }
type RunDoc = AssistantRunRow & { expires_at: Date }

const settingsCol = lazyCollection<SettingsDoc>('assistant_settings', async () => undefined)
const runsCol = lazyCollection<RunDoc>('assistant_runs', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'assistant_runs_id' }),
  c.createIndex({ assistant: 1, started_at: -1 }, { name: 'assistant_runs_assistant_started' }),
  c.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'assistant_runs_ttl' }),
]))
const countersCol = lazyCollection<CounterDoc>('assistant_counters', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'assistant_counters_id' }),
  c.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'assistant_counters_ttl' }),
]))
const marksCol = lazyCollection<MarkDoc>('assistant_marks', (c) => Promise.all([
  c.createIndex({ key: 1 }, { unique: true, name: 'assistant_marks_key' }),
  c.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'assistant_marks_ttl' }),
]))

// ─── Settings ───────────────────────────────────────────────────────────────

let cache: { at: number; all: Record<AssistantId, AssistantSettings> } | null = null

export async function getAllAssistantSettings(fresh = false): Promise<Record<AssistantId, AssistantSettings>> {
  if (!fresh && cache && Date.now() - cache.at < 30_000) return cache.all
  const rows = await (await settingsCol()).find({ _id: { $in: [...ASSISTANT_IDS] } }).toArray().catch(() => [] as SettingsDoc[])
  const by = new Map(rows.map((r) => [r._id, r]))
  const all = Object.fromEntries(ASSISTANT_IDS.map((id) => [id, mergeAssistantSettings(id, by.get(id))])) as Record<AssistantId, AssistantSettings>
  cache = { at: Date.now(), all }
  return all
}

export async function getAssistantSettings(id: AssistantId): Promise<AssistantSettings> {
  return (await getAllAssistantSettings())[id]
}

/** Save a validated patch (cleanAssistantPatch). Switching an agent on makes the actor the proposal owner. */
export async function saveAssistantSettings(id: AssistantId, patch: AssistantSettingsPatch, actorId: string): Promise<AssistantSettings> {
  const set: Record<string, unknown> = { ...patch, updated_at: nowIso(), updated_by: actorId }
  if (patch.enabled === true) set.owner_id = actorId
  await (await settingsCol()).updateOne({ _id: id }, { $set: set }, { upsert: true })
  cache = null
  return getAssistantSettings(id)
}

/** Superadmin who receives loop proposals: the one who switched the agent on, else the first superadmin. */
export async function proposalOwner(s: AssistantSettings): Promise<{ id: string; email: string; name?: string } | null> {
  const { getMongoDb } = await import('@/lib/mongodb')
  const users = (await getMongoDb()).collection('user')
  const pick = async (q: Record<string, unknown>) => users.findOne(q, { projection: { id: 1, _id: 1, email: 1, name: 1, role: 1 } })
  const row = (s.owner_id ? await pick({ $or: [{ id: s.owner_id }, { _id: s.owner_id as never }], role: 'superadmin' }) : null) ?? await pick({ role: 'superadmin' })
  if (!row) return null
  return { id: String(row.id ?? row._id), email: String(row.email || ''), ...(row.name ? { name: String(row.name) } : {}) }
}

// ─── Counters + marks ───────────────────────────────────────────────────────

export const today = (now = new Date()) => now.toISOString().slice(0, 10)

async function bump(id: string, ttlDays = 2): Promise<number> {
  const r = await (await countersCol()).findOneAndUpdate({ id }, { $inc: { n: 1 }, $setOnInsert: { id, expires_at: new Date(Date.now() + ttlDays * DAY) } }, { upsert: true, returnDocument: 'after' })
  return r?.n ?? 1
}
async function readCounter(id: string): Promise<number> {
  return (await (await countersCol()).findOne({ id }))?.n ?? 0
}

/** Opaque per-user reference for counters and the run log (never reversible to an email). */
export const userRef = (userId: string) => createHash('sha256').update(`assistant:${userId}`).digest('hex').slice(0, 20)

/** Count one question for the user today; returns the new total. */
export const countUserQuestion = (assistant: AssistantId, userId: string, now = new Date()) => bump(`${assistant}:u:${userRef(userId)}:${today(now)}`).catch(() => Number.POSITIVE_INFINITY)

/**
 * Mark a unit of work done (idempotency / cooldown). Returns false when it was
 * already marked and the mark has not expired — the caller skips the work.
 */
export async function markOnce(assistant: AssistantId, key: string, ttlDays: number, now = new Date()): Promise<boolean> {
  const col = await marksCol()
  const k = `${assistant}:${key}`
  try {
    const r = await col.updateOne(
      { key: k, expires_at: { $lte: now } },
      { $set: { key: k, assistant, at: now.toISOString(), expires_at: new Date(now.getTime() + ttlDays * DAY) } },
    )
    if (r.modifiedCount) return true
    await col.insertOne({ key: k, assistant, at: now.toISOString(), expires_at: new Date(now.getTime() + ttlDays * DAY) })
    return true
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return false
    throw e
  }
}

/** Keys (without the assistant prefix) still marked — pure cooldown filter input. */
export async function activeMarks(assistant: AssistantId, keys: readonly string[], now = new Date()): Promise<Set<string>> {
  if (!keys.length) return new Set()
  const rows = await (await marksCol()).find({ key: { $in: keys.map((k) => `${assistant}:${k}`) }, expires_at: { $gt: now } }, { projection: { _id: 0, key: 1 } }).toArray()
  const prefix = `${assistant}:`.length
  return new Set(rows.map((r) => r.key.slice(prefix)))
}

// ─── AI gate ────────────────────────────────────────────────────────────────

/** May this assistant call the model now? Takes one slot of today's cap when it may. */
export async function takeAiSlot(id: AssistantId, now = new Date()): Promise<{ ok: true } | { ok: false; reason: AiBlock }> {
  const feature = assistantMeta(id).ai_feature
  if (!feature) return { ok: false, reason: 'off' }
  const s = await getAssistantSettings(id)
  const [{ featureSpendMicros, aiBudgetBlocks }, calls] = await Promise.all([import('@/lib/ai/usage-record'), readCounter(`${id}:ai:${today(now)}`).catch(() => Number.POSITIVE_INFINITY)])
  const [micros, budget] = await Promise.all([featureSpendMicros([feature], now), aiBudgetBlocks(feature)])
  // Unreadable spend counts as capped (fail closed).
  const spent = micros === null ? Number.POSITIVE_INFINITY : micros / 1_000_000
  const block = assistantAiBlocked(s, calls, spent, budget)
  if (block) return { ok: false, reason: block }
  const n = await bump(`${id}:ai:${today(now)}`).catch(() => Number.POSITIVE_INFINITY)
  return n <= s.daily_ai_cap ? { ok: true } : { ok: false, reason: 'daily_cap' }
}

export async function aiUsageToday(id: AssistantId, now = new Date()): Promise<{ calls: number; spent_usd: number | null }> {
  const feature = assistantMeta(id).ai_feature
  if (!feature) return { calls: 0, spent_usd: null }
  const { featureSpendMicros } = await import('@/lib/ai/usage-record')
  const [calls, micros] = await Promise.all([readCounter(`${id}:ai:${today(now)}`).catch(() => 0), featureSpendMicros([feature], now)])
  return { calls, spent_usd: micros === null ? null : Math.round(micros / 10_000) / 100 }
}

// ─── Run log ────────────────────────────────────────────────────────────────

export async function recordRun(row: Omit<AssistantRunRow, 'id' | 'started_at' | 'finished_at'> & { started_at?: string }): Promise<AssistantRunRow> {
  const started = row.started_at ?? nowIso()
  const doc: RunDoc = { ...row, id: newId(), started_at: started, finished_at: nowIso(), message: String(row.message || '').slice(0, 400), expires_at: new Date(Date.now() + 90 * DAY) }
  await (await runsCol()).insertOne({ ...doc }).catch((e) => console.error('[assistants] run log write failed', (e as Error)?.message))
  const { expires_at: _e, ...out } = doc
  void _e
  return out
}

export async function listRuns(assistant: AssistantId | null, limit = 30): Promise<AssistantRunRow[]> {
  const q = assistant ? { assistant } : {}
  return (await (await runsCol()).find(q, { projection: { _id: 0, expires_at: 0 } }).sort({ started_at: -1 }).limit(Math.max(1, Math.min(200, limit))).toArray()) as AssistantRunRow[]
}

/** Counts per assistant over the last N days (admin page + copilot activity tool). */
export async function runStats(days = 7, now = new Date()): Promise<Record<string, { runs: number; failed: number; last_at: string | null }>> {
  const since = new Date(now.getTime() - days * DAY).toISOString()
  const rows = await (await runsCol()).aggregate<{ _id: string; runs: number; failed: number; last_at: string }>([
    { $match: { started_at: { $gte: since } } },
    { $group: { _id: '$assistant', runs: { $sum: 1 }, failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } }, last_at: { $max: '$started_at' } } },
  ]).toArray().catch(() => [])
  return Object.fromEntries(rows.map((r) => [r._id, { runs: r.runs, failed: r.failed, last_at: r.last_at ?? null }]))
}
