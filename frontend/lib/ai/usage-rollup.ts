/**
 * Daily AI spend rollups (server only) — keeps spend history after raw
 * `ai_usage` rows expire (90-day TTL).
 *
 * Collection `ai_usage_daily` (never expires): one doc per UTC day × feature ×
 * provider × model × tenant with calls, tokens, cost_micro (recorded),
 * estimated_micro + `estimated` flag (rows without a recorded cost, priced at
 * rollup time). Written by the daily platform job "ai-usage-rollup"
 * (lib/platform-cron: leased per day window, so replicas never double-run).
 * Each day is recomputed from raw rows and upserted by id, and that day's
 * stale groups are removed — rerunning a day gives the same result. The first
 * run backfills from the oldest raw row, ROLLUP_MAX_DAYS per run.
 */
import 'server-only'
import { getAiCostSettings } from './usage-record'
import { bookFor, dayOf, fromRollupDoc, rawCutoffDay, rollupDays, toRollupDoc, type RollupDoc, type SpendGroupRow } from './spend'

const DAILY = 'ai_usage_daily'
const STATE_ID = 'rollup:state'

async function db() {
  const { getMongoDb } = await import('@/lib/mongodb')
  return getMongoDb()
}

let indexed: Promise<unknown> | null = null
async function dailyCol() {
  const d = await db()
  if (!indexed) {
    indexed = Promise.all([
      d.collection(DAILY).createIndex({ id: 1 }, { unique: true, name: 'ai_usage_daily_id' }),
      d.collection(DAILY).createIndex({ day: -1 }, { name: 'ai_usage_daily_day' }),
    ]).catch(() => { indexed = null })
  }
  return d.collection<RollupDoc & { updated_at: string }>(DAILY)
}

export interface RollupReport { days: string[]; groups: number }

/** Roll up finished days. Idempotent; safe to call any time (the platform job calls it daily). */
export async function runAiUsageRollup(now = new Date()): Promise<RollupReport> {
  const d = await db()
  const state = d.collection('ai_spend_counters')
  const st = await state.findOne({ id: STATE_ID }, { projection: { _id: 0, last_day: 1 } })
  let earliest: string | null = null
  if (!st?.last_day) {
    const first = await d.collection('ai_usage').find({}, { projection: { _id: 0, createdAt: 1 } }).sort({ createdAt: 1 }).limit(1).toArray()
    earliest = first[0]?.createdAt instanceof Date ? dayOf(first[0].createdAt) : null
  }
  const days = rollupDays(typeof st?.last_day === 'string' ? st.last_day : null, earliest, now)
  if (!days.length) return { days: [], groups: 0 }
  const book = bookFor(await getAiCostSettings(true))
  const { spendRows } = await import('./spend-report')
  const col = await dailyCol()
  let groups = 0
  for (const day of days) {
    const from = new Date(`${day}T00:00:00.000Z`)
    const rows = await spendRows(from, new Date(from.getTime() + 86_400_000))
    const docs = rows.map((r) => toRollupDoc(r, book))
    const at = new Date().toISOString()
    if (docs.length) {
      await col.bulkWrite(docs.map((doc) => ({ updateOne: { filter: { id: doc.id }, update: { $set: { ...doc, updated_at: at } }, upsert: true } })), { ordered: false })
    }
    await col.deleteMany({ day, id: { $nin: docs.map((x) => x.id) } })
    await state.updateOne({ id: STATE_ID }, { $set: { id: STATE_ID, kind: 'state', last_day: day, updated_at: at } }, { upsert: true })
    groups += docs.length
  }
  return { days, groups }
}

/** Rollup rows for UTC days in [fromDay, toDay). */
export async function rollupRows(fromDay: string, toDay: string): Promise<SpendGroupRow[]> {
  if (fromDay >= toDay) return []
  const docs = await (await dailyCol()).find({ day: { $gte: fromDay, $lt: toDay } }, { projection: { _id: 0, updated_at: 0 } }).limit(50_000).toArray()
  return docs.map((x) => fromRollupDoc(x as RollupDoc))
}

/**
 * Spend rows for [from, to): raw ai_usage rows inside the raw window, daily
 * rollups for whole days before it (raw rows there may already have expired).
 */
export async function spendRowsWithHistory(from: Date, to: Date, now = new Date()): Promise<SpendGroupRow[]> {
  const { spendRows } = await import('./spend-report')
  const cutoffDay = rawCutoffDay(now)
  const cutoff = new Date(`${cutoffDay}T00:00:00.000Z`)
  if (from >= cutoff) return spendRows(from, to)
  const [old, recent] = await Promise.all([
    rollupRows(dayOf(from), to < cutoff ? dayOf(to) : cutoffDay),
    to > cutoff ? spendRows(cutoff, to) : Promise.resolve([]),
  ])
  return [...old, ...recent]
}
