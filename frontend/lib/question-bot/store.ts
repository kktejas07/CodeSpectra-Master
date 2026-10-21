/**
 * Question bot persistence (server only).
 *
 * Collections:
 *   question_domains       one row per domain (seeded from DEFAULT_DOMAINS once)
 *   question_bot_settings  one doc: settings + the run claim (running_until)
 *   question_bot_runs      one row per run: plan, per-cell results, spend
 * Also adds a (domain, difficulty, type) index on question_bank for coverage.
 */
import 'server-only'
import type { Collection, Db } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ids'
import { logger } from '@/lib/logger'
import { DEFAULT_DOMAINS, domainBankFilter, BOT_QUESTION_TYPES, type QuestionDomain } from './domains'
import { countKey, type CoverageCounts, type PlannedCell } from './planner'
import { DEFAULT_BOT_SETTINGS, type QuestionBotSettings } from './settings'

const SETTINGS_ID = 'settings'

export interface BotCellResult {
  domain: string
  type: string
  difficulty: string
  asked: number
  inserted: number
  skipped: number
  dropped: number
  reasons: string[]
  error?: string
}

export interface BotRunDoc {
  id: string
  trigger: 'cron' | 'manual' | 'agent'
  by: string | null
  status: 'running' | 'ok' | 'partial' | 'failed' | 'skipped'
  started_at: string
  finished_at?: string
  /** UTC day / month keys for the caps. */
  day: string
  month: string
  planned: Array<Pick<PlannedCell, 'domain' | 'type' | 'difficulty' | 'gap' | 'take'>>
  results: BotCellResult[]
  inserted: number
  dropped: number
  cost_usd: number
  message?: string
}

let indexed = false
async function db(): Promise<Db> {
  const d = await getMongoDb()
  if (!indexed) {
    indexed = true
    void Promise.all([
      d.collection('question_domains').createIndex({ id: 1 }, { unique: true }),
      d.collection('question_domains').createIndex({ active: 1 }),
      d.collection('question_bot_settings').createIndex({ id: 1 }, { unique: true }),
      d.collection('question_bot_runs').createIndex({ id: 1 }, { unique: true }),
      d.collection('question_bot_runs').createIndex({ started_at: -1 }),
      d.collection('question_bot_runs').createIndex({ day: 1 }),
      d.collection('question_bot_runs').createIndex({ month: 1 }),
      d.collection('question_bank').createIndex({ domain: 1, difficulty: 1, type: 1 }, { sparse: true, name: 'question_bank_domain_cells' }),
      d.collection('question_bank').createIndex({ review_status: 1, domain: 1, createdAt: -1 }, { name: 'question_bank_review_domain' }),
    ]).catch((e) => { indexed = false; logger.warn(`[question-bot] index setup: ${(e as Error).message}`) })
  }
  return d
}

export async function questionDomains(): Promise<Collection<QuestionDomain>> {
  return (await db()).collection<QuestionDomain>('question_domains')
}
export async function botRuns(): Promise<Collection<BotRunDoc>> {
  return (await db()).collection<BotRunDoc>('question_bot_runs')
}
async function settingsCol(): Promise<Collection<QuestionBotSettings & { id: string; running_until?: string; running_run_id?: string; updated_at?: string; updated_by?: string | null }>> {
  return (await db()).collection('question_bot_settings') as never
}

// ─── Domains ────────────────────────────────────────────────────────────────

let seeded = false
/** Insert the seed domains once (idempotent: unique id, existing rows untouched). */
export async function ensureDomainSeed(): Promise<void> {
  if (seeded) return
  const col = await questionDomains()
  const now = nowIso()
  await col.bulkWrite(DEFAULT_DOMAINS.map((d) => ({
    updateOne: { filter: { id: d.id }, update: { $setOnInsert: { ...d, created_at: now, updated_at: now } }, upsert: true },
  })), { ordered: false })
  seeded = true
}

export async function listDomains(opts: { activeOnly?: boolean } = {}): Promise<QuestionDomain[]> {
  await ensureDomainSeed()
  const col = await questionDomains()
  return col.find(opts.activeOnly ? { active: true } : {}, { projection: { _id: 0 } }).sort({ kind: 1, label: 1 }).toArray() as Promise<QuestionDomain[]>
}

export async function getDomain(id: string): Promise<QuestionDomain | null> {
  await ensureDomainSeed()
  return (await questionDomains()).findOne({ id }, { projection: { _id: 0 } }) as Promise<QuestionDomain | null>
}

export async function createDomain(d: QuestionDomain): Promise<{ ok: true } | { ok: false; error: string }> {
  const col = await questionDomains()
  const now = nowIso()
  try {
    await col.insertOne({ ...d, created_at: now, updated_at: now })
    return { ok: true }
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return { ok: false, error: 'A domain with this id already exists.' }
    throw e
  }
}

export async function updateDomain(id: string, patch: Partial<QuestionDomain>): Promise<boolean> {
  const { id: _id, kind: _kind, ...rest } = patch
  const r = await (await questionDomains()).updateOne({ id }, { $set: { ...rest, updated_at: nowIso() } })
  return r.matchedCount === 1
}

/** Remove a domain. Its questions stay in the bank (they keep their `domain` tag). */
export async function deleteDomain(id: string): Promise<boolean> {
  const r = await (await questionDomains()).deleteOne({ id })
  return r.deletedCount === 1
}

// ─── Coverage ───────────────────────────────────────────────────────────────

export interface Coverage {
  /** approved + waiting drafts (what the planner fills toward). */
  total: CoverageCounts
  /** approved only (what adaptive tests can draw from). */
  approved: CoverageCounts
}

/** Bank counts per domain × type × difficulty (active rows; rejected drafts are inactive). */
export async function coverageCounts(domains: readonly QuestionDomain[]): Promise<Coverage> {
  const bank = (await db()).collection('question_bank')
  const total: CoverageCounts = {}
  const approved: CoverageCounts = {}
  await Promise.all(domains.map(async (d) => {
    const rows = await bank.aggregate<{ _id: { type: string; difficulty: string; approved: boolean }; n: number }>([
      { $match: { $and: [domainBankFilter(d), { is_active: { $ne: false } }, { type: { $in: [...BOT_QUESTION_TYPES] } }] } },
      { $group: { _id: { type: '$type', difficulty: '$difficulty', approved: { $ne: ['$review_status', 'draft'] } }, n: { $sum: 1 } } },
    ]).toArray()
    for (const r of rows) {
      const k = countKey(d.id, r._id.type, r._id.difficulty)
      total[k] = (total[k] || 0) + r.n
      if (r._id.approved) approved[k] = (approved[k] || 0) + r.n
    }
  }))
  return { total, approved }
}

// ─── Settings + run claim ───────────────────────────────────────────────────

export async function getBotSettings(): Promise<QuestionBotSettings> {
  const doc = await (await settingsCol()).findOne({ id: SETTINGS_ID }, { projection: { _id: 0, id: 0, running_until: 0, running_run_id: 0, updated_at: 0, updated_by: 0 } })
  return { ...DEFAULT_BOT_SETTINGS, ...(doc ?? {}) }
}

export async function updateBotSettings(patch: Partial<QuestionBotSettings>, by: string | null): Promise<QuestionBotSettings> {
  await (await settingsCol()).updateOne({ id: SETTINGS_ID }, { $set: { ...patch, updated_at: nowIso(), updated_by: by } }, { upsert: true })
  return getBotSettings()
}

/** Claim the single run slot (atomic across replicas). Released by releaseRun, or expires. */
export async function claimRun(runId: string, now: Date, leaseMs = 20 * 60_000): Promise<boolean> {
  const col = await settingsCol()
  try {
    await col.updateOne({ id: SETTINGS_ID }, { $setOnInsert: { id: SETTINGS_ID } }, { upsert: true })
    const r = await col.updateOne(
      { id: SETTINGS_ID, $or: [{ running_until: { $exists: false } }, { running_until: { $lt: now.toISOString() } }] },
      { $set: { running_until: new Date(now.getTime() + leaseMs).toISOString(), running_run_id: runId } },
    )
    return r.modifiedCount === 1
  } catch {
    return false
  }
}

export async function releaseRun(runId: string): Promise<void> {
  await (await settingsCol()).updateOne({ id: SETTINGS_ID, running_run_id: runId }, { $unset: { running_until: '', running_run_id: '' } }).catch(() => undefined)
}

export async function runInProgress(now: Date): Promise<boolean> {
  const doc = await (await settingsCol()).findOne({ id: SETTINGS_ID }, { projection: { running_until: 1 } })
  return !!doc?.running_until && doc.running_until > now.toISOString()
}

// ─── Runs + spend ───────────────────────────────────────────────────────────

export const dayKey = (d: Date): string => d.toISOString().slice(0, 10)
export const monthKey = (d: Date): string => d.toISOString().slice(0, 7)

export async function usageSoFar(now: Date): Promise<{ writtenToday: number; spentThisMonth: number }> {
  const col = await botRuns()
  const [today, month] = await Promise.all([
    col.aggregate<{ n: number }>([{ $match: { day: dayKey(now) } }, { $group: { _id: null, n: { $sum: '$inserted' } } }]).toArray(),
    col.aggregate<{ usd: number }>([{ $match: { month: monthKey(now) } }, { $group: { _id: null, usd: { $sum: '$cost_usd' } } }]).toArray(),
  ])
  return { writtenToday: today[0]?.n ?? 0, spentThisMonth: Math.round((month[0]?.usd ?? 0) * 1e4) / 1e4 }
}

export async function startRunDoc(run: Omit<BotRunDoc, 'id'> & { id?: string }): Promise<BotRunDoc> {
  const doc: BotRunDoc = { ...run, id: run.id || newId() }
  await (await botRuns()).insertOne({ ...doc })
  return doc
}

export async function saveRunDoc(id: string, fields: Partial<BotRunDoc>): Promise<void> {
  const { id: _id, ...rest } = fields
  await (await botRuns()).updateOne({ id }, { $set: rest })
}

export async function recentRuns(limit = 10): Promise<BotRunDoc[]> {
  return (await botRuns()).find({}, { projection: { _id: 0 } }).sort({ started_at: -1 }).limit(limit).toArray() as Promise<BotRunDoc[]>
}
