/**
 * Company test storage (server only).
 *
 *   company_exam_patterns   one doc per company exam (see ./types)
 *   company_test_versions   built Easy / Moderate / Tough versions
 *   company_test_attempts   a learner's practice runs (question snapshots + answers)
 *   company_test_settings   { key: 'settings', value } and AI usage counters
 *                           { key: 'usage:day:YYYY-MM-DD' | 'usage:month:YYYY-MM', questions, cost_usd }
 */
import 'server-only'
import type { Collection, Db } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import {
  DEFAULT_SETTINGS, mergeSettings, remainingUnderCaps, patternFromInput, patternInputSchema,
  type CompanyExamPattern, type CompanyTestSettings, type CompanyTestVersion,
} from './types'
import { SEED_PATTERNS } from './seed-patterns'

export const PATTERNS = 'company_exam_patterns'
export const VERSIONS = 'company_test_versions'
export const ATTEMPTS = 'company_test_attempts'
export const SETTINGS = 'company_test_settings'

let indexes: Promise<unknown> | null = null
let seeded: Promise<unknown> | null = null

async function db(): Promise<Db> {
  const d = await getMongoDb()
  if (!indexes) {
    indexes = Promise.all([
      d.collection(PATTERNS).createIndex({ id: 1 }, { unique: true, name: 'cep_id' }),
      d.collection(PATTERNS).createIndex({ companySlug: 1, active: 1 }, { name: 'cep_company' }),
      d.collection(VERSIONS).createIndex({ id: 1 }, { unique: true, name: 'ctv_id' }),
      d.collection(VERSIONS).createIndex({ patternId: 1 }, { name: 'ctv_pattern' }),
      d.collection(ATTEMPTS).createIndex({ id: 1 }, { unique: true, name: 'cta_id' }),
      d.collection(ATTEMPTS).createIndex({ userId: 1, createdAt: -1 }, { name: 'cta_user_time' }),
      d.collection(SETTINGS).createIndex({ key: 1 }, { unique: true, name: 'cts_key' }),
    ]).catch((e) => { indexes = null; console.error('[company-tests] index build failed:', (e as Error)?.message) })
  }
  return d
}

export async function patterns(): Promise<Collection<CompanyExamPattern>> {
  const d = await db()
  if (!seeded) {
    seeded = seedPatterns(d).catch((e) => {
      seeded = null
      console.error('[company-tests] seeding failed:', (e as Error)?.message)
    })
  }
  await seeded
  return d.collection<CompanyExamPattern>(PATTERNS)
}

/**
 * Insert each seed once, ever. Seeded ids are remembered in
 * company_test_settings { key: 'seeded' }, so an admin's edits are never
 * overwritten and a pattern the admin deleted doesn't come back (idempotent).
 */
async function seedPatterns(d: Db): Promise<void> {
  const col = d.collection<CompanyExamPattern>(PATTERNS)
  const settings = d.collection(SETTINGS)
  const row = await settings.findOne({ key: 'seeded' }, { projection: { _id: 0, ids: 1 } })
  const done = new Set<string>(Array.isArray(row?.ids) ? row.ids : [])
  const now = new Date().toISOString()
  const todo = SEED_PATTERNS.map((raw) => patternFromInput(patternInputSchema.parse(raw), now, 'seed')).filter((d) => !done.has(d.id))
  if (!todo.length) return
  await col.bulkWrite(todo.map((doc) => ({ updateOne: { filter: { id: doc.id }, update: { $setOnInsert: doc }, upsert: true } })) as never, { ordered: false })
  await settings.updateOne({ key: 'seeded' }, { $addToSet: { ids: { $each: todo.map((d) => d.id) } }, $setOnInsert: { key: 'seeded' } }, { upsert: true })
}

export async function versions(): Promise<Collection<CompanyTestVersion>> {
  return (await db()).collection<CompanyTestVersion>(VERSIONS)
}

export async function attempts(): Promise<Collection<Record<string, any>>> {
  return (await db()).collection(ATTEMPTS)
}

async function settingsCol(): Promise<Collection<Record<string, any>>> {
  return (await db()).collection(SETTINGS)
}

let settingsCache: { at: number; value: CompanyTestSettings } | null = null

export async function getCompanyTestSettings(fresh = false): Promise<CompanyTestSettings> {
  if (!fresh && settingsCache && Date.now() - settingsCache.at < 60_000) return settingsCache.value
  try {
    const row = await (await settingsCol()).findOne({ key: 'settings' }, { projection: { _id: 0, value: 1 } })
    const value = mergeSettings(row?.value)
    settingsCache = { at: Date.now(), value }
    return value
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function saveCompanyTestSettings(patch: unknown, actorId: string): Promise<CompanyTestSettings> {
  const next = mergeSettings(patch, await getCompanyTestSettings(true))
  await (await settingsCol()).updateOne(
    { key: 'settings' },
    { $set: { key: 'settings', value: next, updatedAt: new Date().toISOString(), updatedBy: actorId } },
    { upsert: true },
  )
  settingsCache = { at: Date.now(), value: next }
  return next
}

const dayKey = (d: Date) => `usage:day:${d.toISOString().slice(0, 10)}`
const monthKey = (d: Date) => `usage:month:${d.toISOString().slice(0, 7)}`

export interface AiUsageState {
  today: number
  monthCostUsd: number
  dailyCap: number
  monthlyCapUsd: number
  /** Questions that may still be generated today (0 when either cap is hit). */
  remaining: number
}

export async function aiUsageState(now = new Date()): Promise<AiUsageState> {
  const s = await getCompanyTestSettings()
  const rows = await (await settingsCol()).find({ key: { $in: [dayKey(now), monthKey(now)] } }).toArray()
  const today = Number(rows.find((r) => r.key === dayKey(now))?.questions) || 0
  const monthCostUsd = Number(rows.find((r) => r.key === monthKey(now))?.cost_usd) || 0
  return { today, monthCostUsd, dailyCap: s.aiDailyQuestionCap, monthlyCapUsd: s.aiMonthlyCostCapUsd, remaining: remainingUnderCaps({ today, monthCostUsd }, s) }
}

export async function recordAiUsage(questions: number, costUsd: number, now = new Date()): Promise<void> {
  const col = await settingsCol()
  await Promise.all([
    col.updateOne({ key: dayKey(now) }, { $inc: { questions, cost_usd: costUsd }, $setOnInsert: { key: dayKey(now) } }, { upsert: true }),
    col.updateOne({ key: monthKey(now) }, { $inc: { questions, cost_usd: costUsd }, $setOnInsert: { key: monthKey(now) } }, { upsert: true }),
  ])
}

export async function getPattern(id: string): Promise<CompanyExamPattern | null> {
  return (await patterns()).findOne({ id }, { projection: { _id: 0 } })
}

export async function listPatterns(filter: { companySlug?: string; activeOnly?: boolean } = {}): Promise<CompanyExamPattern[]> {
  const q: Record<string, unknown> = {}
  if (filter.companySlug) q.companySlug = filter.companySlug
  if (filter.activeOnly) q.active = true
  return (await patterns()).find(q, { projection: { _id: 0 } }).sort({ companyName: 1, examName: 1 }).limit(500).toArray()
}
