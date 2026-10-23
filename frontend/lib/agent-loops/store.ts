/**
 * Agent loop storage (server only).
 *
 *   agent_loop_settings  { id: loopId, settings, usage: { day, ai_calls }, state, updated_at, updated_by }
 *   agent_loop_runs      one row per run (the admin's run log; TTL 180 days)
 *   agent_loop_findings  what a run found / proposes; `key` unique so a re-run never duplicates one
 *
 * Run rows hold counts, codes and ids only — never member text, prompts or PII.
 */
import 'server-only'
import { randomUUID } from 'node:crypto'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { mergeLoopSettings, type AgentLoopSettings, type LoopSettingsPatch } from './settings'
import type { AgentLoopId } from './registry'
import type { FindingDoc, FindingInput, LoopRunDoc } from './types'

const nowIso = () => new Date().toISOString()
const RUN_KEEP_MS = 180 * 86_400_000

interface SettingsDoc {
  id: AgentLoopId
  settings?: Partial<AgentLoopSettings>
  usage?: { day?: string; ai_calls?: number }
  state?: Record<string, unknown>
  updated_at?: string
  updated_by?: string
}

let built: Promise<unknown> | null = null
async function ensure() {
  const db = await getMongoDb()
  if (!built) {
    built = Promise.all([
      db.collection('agent_loop_settings').createIndex({ id: 1 }, { unique: true, name: 'als_id' }),
      db.collection('agent_loop_runs').createIndex({ id: 1 }, { unique: true, name: 'alr_id' }),
      db.collection('agent_loop_runs').createIndex({ loop: 1, started_at: -1 }, { name: 'alr_loop_started' }),
      db.collection('agent_loop_runs').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'alr_ttl' }),
      db.collection('agent_loop_findings').createIndex({ id: 1 }, { unique: true, name: 'alf_id' }),
      db.collection('agent_loop_findings').createIndex({ key: 1 }, { unique: true, name: 'alf_key' }),
      db.collection('agent_loop_findings').createIndex({ loop: 1, status: 1, updated_at: -1 }, { name: 'alf_loop_status' }),
      db.collection('agent_loop_findings').createIndex({ status: 1, updated_at: -1 }, { name: 'alf_status' }),
    ]).catch((e) => {
      built = null
      console.error('[agent-loops] index setup:', (e as Error)?.message)
    })
  }
  await built
  return db
}

export async function settingsCol(): Promise<Collection<SettingsDoc>> {
  return (await ensure()).collection<SettingsDoc>('agent_loop_settings')
}
export async function runsCol(): Promise<Collection<LoopRunDoc>> {
  return (await ensure()).collection<LoopRunDoc>('agent_loop_runs')
}
export async function findingsCol(): Promise<Collection<FindingDoc>> {
  return (await ensure()).collection<FindingDoc>('agent_loop_findings')
}

// ─── Settings, daily AI counter, loop state ────────────────────────────────

export async function getLoopSettings(id: AgentLoopId): Promise<{ settings: AgentLoopSettings; aiCallsToday: number; state: Record<string, unknown> }> {
  const doc = await (await settingsCol()).findOne({ id }, { projection: { _id: 0 } })
  const day = nowIso().slice(0, 10)
  return { settings: mergeLoopSettings(id, doc?.settings), aiCallsToday: doc?.usage?.day === day ? doc.usage.ai_calls || 0 : 0, state: doc?.state || {} }
}

export async function saveLoopSettings(id: AgentLoopId, patch: LoopSettingsPatch, actorId: string): Promise<AgentLoopSettings> {
  const set: Record<string, unknown> = { updated_at: nowIso(), updated_by: actorId }
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) set[`settings.${k}`] = v
  await (await settingsCol()).updateOne({ id }, { $set: set, $setOnInsert: { id } }, { upsert: true })
  return (await getLoopSettings(id)).settings
}

/** Take one AI call from today's allowance atomically (false when the cap is reached). */
export async function takeAiCall(id: AgentLoopId, cap: number): Promise<boolean> {
  if (cap <= 0) return false
  const c = await settingsCol()
  const day = nowIso().slice(0, 10)
  await c.updateOne({ id }, { $setOnInsert: { id } }, { upsert: true }).catch(() => undefined)
  await c.updateOne({ id, 'usage.day': { $ne: day } }, { $set: { usage: { day, ai_calls: 0 } } })
  const r = await c.updateOne({ id, 'usage.day': day, 'usage.ai_calls': { $lt: cap } }, { $inc: { 'usage.ai_calls': 1 } })
  return r.modifiedCount === 1
}

export async function setLoopState(id: AgentLoopId, state: Record<string, unknown>): Promise<void> {
  const set: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(state)) set[`state.${k}`] = v
  if (!Object.keys(set).length) return
  await (await settingsCol()).updateOne({ id }, { $set: set, $setOnInsert: { id } }, { upsert: true })
}

// ─── Runs ────────────────────────────────────────────────────────────────────

export async function startRun(loop: AgentLoopId, window: string, trigger: LoopRunDoc['trigger'], by: string | null, now = new Date()): Promise<LoopRunDoc> {
  const doc: LoopRunDoc = {
    id: `alr_${randomUUID()}`, loop, window, trigger, by, status: 'running', started_at: now.toISOString(), finished_at: null, duration_ms: 0,
    summary: {}, notes: [], ai: { calls: 0, fallback: null }, findings: 0, error: null, expires_at: new Date(now.getTime() + RUN_KEEP_MS),
  }
  await (await runsCol()).insertOne({ ...doc })
  return doc
}

export async function finishRun(id: string, patch: Pick<LoopRunDoc, 'status'> & Partial<Pick<LoopRunDoc, 'summary' | 'notes' | 'ai' | 'findings' | 'error'>>, startedAt: string): Promise<void> {
  const finished = nowIso()
  await (await runsCol()).updateOne({ id }, { $set: { ...patch, finished_at: finished, duration_ms: Date.parse(finished) - Date.parse(startedAt), ...(patch.error ? { error: patch.error.slice(0, 300) } : {}) } })
}

export async function listRuns(loop: AgentLoopId | null, limit = 20): Promise<LoopRunDoc[]> {
  return (await (await runsCol()).find(loop ? { loop } : {}, { projection: { _id: 0, expires_at: 0 } }).sort({ started_at: -1 }).limit(limit).toArray()) as LoopRunDoc[]
}

export async function lastRuns(loops: readonly AgentLoopId[]): Promise<Partial<Record<AgentLoopId, LoopRunDoc>>> {
  const rows = await Promise.all(loops.map(async (l) => [l, (await listRuns(l, 1))[0]] as const))
  return Object.fromEntries(rows.filter(([, r]) => r)) as Partial<Record<AgentLoopId, LoopRunDoc>>
}

// ─── Findings ────────────────────────────────────────────────────────────────

/** A dismissed / applied finding may come back after this long (the problem is still there). */
const REOPEN_AFTER_MS = 30 * 86_400_000

/**
 * Store a run's findings. A new key is inserted; an open one is refreshed;
 * a decided one stays decided unless it was decided over 30 days ago.
 * Returns how many are new (or re-opened).
 */
export async function upsertFindings(loop: AgentLoopId, runId: string, items: readonly FindingInput[], now = new Date()): Promise<number> {
  if (!items.length) return 0
  const c = await findingsCol()
  const ts = now.toISOString()
  const reopenBefore = new Date(now.getTime() - REOPEN_AFTER_MS).toISOString()
  let created = 0
  for (const f of items) {
    const fields = { kind: f.kind, severity: f.severity, params: f.params ?? {}, target: f.target, proposal: f.proposal ?? null, detail: f.detail ?? null, tenant_id: f.tenant_id ?? null, run_id: runId, updated_at: ts }
    const status = f.status ?? 'open'
    try {
      const r = await c.updateOne(
        { key: f.key, $or: [{ status: 'open' }, { decided_at: { $lt: reopenBefore } }] },
        { $set: { ...fields, status, ...(status !== 'open' ? { decided_at: ts, decided_by: 'agent', result: f.result ?? null } : {}) }, $setOnInsert: { id: `alf_${randomUUID()}`, key: f.key, loop, created_at: ts } },
        { upsert: true },
      )
      if (r.upsertedCount) created++
    } catch (e) {
      // Duplicate key = the finding exists and was decided recently: leave it.
      if ((e as { code?: number })?.code !== 11000) throw e
    }
  }
  return created
}

export interface FindingFilter { loop?: AgentLoopId | null; status?: FindingDoc['status'] | 'any'; tenantId?: string | null; limit?: number }

export async function listFindings(f: FindingFilter = {}): Promise<FindingDoc[]> {
  const q: Record<string, unknown> = {}
  if (f.loop) q.loop = f.loop
  if (f.status && f.status !== 'any') q.status = f.status
  if (f.tenantId !== undefined) q.tenant_id = f.tenantId
  return (await (await findingsCol()).find(q, { projection: { _id: 0 } }).sort({ updated_at: -1 }).limit(Math.min(200, f.limit ?? 50)).toArray()) as FindingDoc[]
}

export async function countOpenFindings(): Promise<Record<string, number>> {
  const rows = await (await findingsCol()).aggregate<{ _id: string; n: number }>([{ $match: { status: 'open', tenant_id: null } }, { $group: { _id: '$loop', n: { $sum: 1 } } }]).toArray()
  return Object.fromEntries(rows.map((r) => [r._id, r.n]))
}

export async function getFinding(id: string): Promise<FindingDoc | null> {
  if (!/^alf_[0-9a-f-]{36}$/.test(id)) return null
  return (await (await findingsCol()).findOne({ id }, { projection: { _id: 0 } })) as FindingDoc | null
}

/** Atomic open → applying claim (a double click applies once). */
export async function claimFinding(id: string): Promise<FindingDoc | null> {
  return (await (await findingsCol()).findOneAndUpdate({ id, status: 'open' }, { $set: { status: 'applying', updated_at: nowIso() } }, { returnDocument: 'after', projection: { _id: 0 } })) as FindingDoc | null
}

export async function settleFinding(id: string, status: 'applied' | 'dismissed' | 'failed' | 'open', by: string, result: { ok: boolean; message: string } | null): Promise<FindingDoc | null> {
  const ts = nowIso()
  return (await (await findingsCol()).findOneAndUpdate(
    { id },
    { $set: { status, updated_at: ts, ...(status === 'open' ? {} : { decided_at: ts, decided_by: by }), result } },
    { returnDocument: 'after', projection: { _id: 0 } },
  )) as FindingDoc | null
}
