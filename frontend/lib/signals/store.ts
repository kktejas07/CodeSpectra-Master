/**
 * Signals storage (server only).
 *  - signal_drafts      SignalDraftDoc (lib/db/signal-drafts)
 *  - signal_feed_state  per-feed trust / on-off overrides + last run
 *  - signal_settings    one doc {id:'default'}: settings, AI usage counters, digest marker
 *  - blog_posts         published news (tags: 'signals', `news:<topic>`)
 */
import type { Collection, Db } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import type { SignalDraftDoc } from '@/lib/db/signal-drafts'
import type { SignalFeedState } from './feeds'
import { dayKey, monthKey, normalizeSignalSettings, type SignalSettings, type SignalUsage } from './settings'

export { nowIso } from '@/lib/db/ids'

const built = new Map<string, Promise<unknown> | null>()
function lazy<T extends object>(name: string, build: (c: Collection<T>) => Promise<unknown>) {
  return async (): Promise<Collection<T>> => {
    const db: Db = await getMongoDb()
    const col = db.collection<T>(name)
    if (!built.get(name)) built.set(name, build(col).catch((e) => { built.set(name, null); console.error(`[signals] ${name} index`, (e as Error)?.message) }))
    await built.get(name)
    return col
  }
}
export function __resetSignalIndexes() { built.clear() }

export type SignalSettingsDoc = SignalSettings & { id: 'default'; usage?: SignalUsage; last_digest_day?: string | null; updated_at?: string; updated_by?: string | null }

export const draftsCol = lazy<SignalDraftDoc>('signal_drafts', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'sig_id' }),
  c.createIndex({ source_url: 1 }, { name: 'sig_source' }),
  c.createIndex({ status: 1, created_at: -1 }, { name: 'sig_status' }),
]))
export const feedStateCol = lazy<SignalFeedState>('signal_feed_state', (c) => c.createIndex({ id: 1 }, { unique: true, name: 'sigfeed_id' }))
export const settingsCol = lazy<SignalSettingsDoc>('signal_settings', (c) => c.createIndex({ id: 1 }, { unique: true, name: 'sigset_id' }))
export const newsPostsCol = lazy<import('@/lib/db/blog-posts').BlogPostDoc>('blog_posts', (c) => c.createIndex({ tags: 1, status: 1, published_at: -1 }, { name: 'blog_news' }))

export async function getSignalSettings(): Promise<SignalSettingsDoc> {
  const doc = await (await settingsCol()).findOne({ id: 'default' }, { projection: { _id: 0 } })
  return { ...(doc || {}), ...normalizeSignalSettings(doc as Record<string, unknown> | null), id: 'default' } as SignalSettingsDoc
}

export async function saveSignalSettings(patch: Partial<SignalSettings>, by: string): Promise<SignalSettingsDoc> {
  await (await settingsCol()).updateOne({ id: 'default' }, { $set: { ...patch, updated_at: new Date().toISOString(), updated_by: by }, $setOnInsert: { id: 'default' } }, { upsert: true })
  return getSignalSettings()
}

/** Add one AI rewrite (+ its estimated cost) to today's / this month's counters. */
export async function recordAiUse(costUsd: number, now: Date): Promise<void> {
  const col = await settingsCol()
  const s = await getSignalSettings()
  const u: SignalUsage = { day: null, day_count: 0, month: null, month_cost_usd: 0, ...(s.usage || {}) }
  const next: SignalUsage = {
    day: dayKey(now), day_count: (u.day === dayKey(now) ? u.day_count : 0) + 1,
    month: monthKey(now), month_cost_usd: Math.round(((u.month === monthKey(now) ? u.month_cost_usd : 0) + Math.max(0, costUsd)) * 10_000) / 10_000,
  }
  await col.updateOne({ id: 'default' }, { $set: { usage: next }, $setOnInsert: { id: 'default' } }, { upsert: true })
}

export async function listFeedStates(): Promise<SignalFeedState[]> {
  return (await (await feedStateCol()).find({}, { projection: { _id: 0 } }).limit(500).toArray()) as SignalFeedState[]
}

export async function setFeedState(id: string, patch: { trusted?: boolean | null; enabled?: boolean }, by: string): Promise<void> {
  const set: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: by }
  if (patch.trusted !== undefined) set.trusted = patch.trusted
  if (patch.enabled !== undefined) set.enabled = patch.enabled
  await (await feedStateCol()).updateOne({ id }, { $set: set, $setOnInsert: { id, ...(patch.trusted === undefined ? { trusted: null } : {}), ...(patch.enabled === undefined ? { enabled: true } : {}) } }, { upsert: true })
}

/** Claim the daily digest for `day` once across replicas. */
export async function claimDigestDay(day: string): Promise<boolean> {
  const col = await settingsCol()
  await col.updateOne({ id: 'default' }, { $setOnInsert: { id: 'default' } }, { upsert: true })
  const r = await col.updateOne({ id: 'default', last_digest_day: { $ne: day } }, { $set: { last_digest_day: day } })
  return r.modifiedCount > 0
}
