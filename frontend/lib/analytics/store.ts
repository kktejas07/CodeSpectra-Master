/**
 * First-party analytics storage (server only).
 *
 *   analytics_events      raw events (page views, custom, server/business). `ts` (Date) carries a
 *                         TTL index — raw rows expire after the retention window (default 400 days,
 *                         Settings → Analytics or ANALYTICS_RETENTION_DAYS). `timestamp` (ISO) is kept
 *                         for the older admin tabs.
 *   analytics_sessions    one row per session (existing collection, now also keyed by visitor_hash).
 *   analytics_rollups     one doc per UTC day, platform-wide: the dashboards read these, not raw rows.
 *   analytics_user_days   { day, user_id, tenant_id } — DAU/WAU/MAU and retention cohorts (same TTL).
 *   analytics_salts       one random salt per UTC day for visitor hashes; expires after 2 days so a
 *                         hash can never be recomputed from an IP afterwards.
 *   analytics_caps        W4-06 per-visitor / per-IP (salted hash) daily event counters, TTL 2 days.
 *   analytics_state       cursors (automation outbox mirror, rollup backfill).
 */
import 'server-only'
import { randomBytes } from 'node:crypto'
import type { Collection, Document } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

export const DEFAULT_RETENTION_DAYS = 400

export function clampRetentionDays(raw: unknown): number {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_RETENTION_DAYS
  return Math.min(1500, Math.max(30, n))
}

export async function retentionDays(): Promise<number> {
  try {
    const { getServerSecretsFromCache } = await import('@/lib/server-secrets-cache')
    const v = (getServerSecretsFromCache() as Record<string, unknown>).analytics_retention_days
    if (v) return clampRetentionDays(v)
  } catch { /* cache not warm */ }
  return clampRetentionDays(process.env.ANALYTICS_RETENTION_DAYS)
}

export interface RawEvent {
  id: string
  /** 'page_view' | custom name | business event name */
  event: string
  kind: 'page' | 'event' | 'server'
  ts: Date
  timestamp: string
  day: string
  path?: string
  /** Private page (token link, test taking, payment step): counted, nothing else stored. */
  private?: boolean
  mode?: 'anon' | 'full' | 'server'
  visitor_hash?: string
  anonymous_id?: string
  session_id?: string
  user_id?: string
  tenant_id?: string | null
  referrer?: string
  source?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  country?: string | null
  device_type?: string
  browser?: string
  os?: string
  properties?: Record<string, unknown>
  /** Server/business events: unique, so a replay is a no-op. */
  dedupe_key?: string
}

let ready: Promise<void> | null = null

async function col<T extends Document>(name: string): Promise<Collection<T>> {
  const db = await getMongoDb()
  if (!ready) ready = ensureIndexes().catch((e) => { ready = null; console.error('[analytics] index setup failed:', (e as Error)?.message) })
  return db.collection<T>(name)
}

/** Create / update indexes; the TTL follows the configured retention (collMod when it changes). */
export async function ensureIndexes(): Promise<void> {
  const db = await getMongoDb()
  const ttl = (await retentionDays()) * 86_400
  const ttlIndex = async (name: string, field: string, indexName: string) => {
    const c = db.collection(name)
    try {
      const existing = (await c.indexes().catch(() => [])) as Array<{ name?: string; expireAfterSeconds?: number }>
      const cur = existing.find((i) => i.name === indexName)
      if (cur && cur.expireAfterSeconds !== ttl) {
        await db.command({ collMod: name, index: { name: indexName, expireAfterSeconds: ttl } })
      } else if (!cur) {
        await c.createIndex({ [field]: 1 }, { name: indexName, expireAfterSeconds: ttl })
      }
    } catch (e) {
      console.error(`[analytics] TTL index ${indexName}:`, (e as Error)?.message)
    }
  }
  await Promise.all([
    ttlIndex('analytics_events', 'ts', 'analytics_events_ttl'),
    ttlIndex('analytics_user_days', 'ts', 'analytics_user_days_ttl'),
    db.collection('analytics_events').createIndex({ day: 1, kind: 1 }, { name: 'analytics_events_day_kind' }),
    db.collection('analytics_events').createIndex({ event: 1, ts: -1 }, { name: 'analytics_events_event_ts' }),
    db.collection('analytics_events').createIndex({ tenant_id: 1, event: 1, ts: -1 }, { name: 'analytics_events_tenant_event' }),
    db.collection('analytics_events').createIndex({ dedupe_key: 1 }, { name: 'analytics_events_dedupe', unique: true, partialFilterExpression: { dedupe_key: { $type: 'string' } } }),
    db.collection('analytics_sessions').createIndex({ visitor_hash: 1, last_activity_at: -1 }, { name: 'analytics_sessions_visitor' }),
    db.collection('analytics_user_days').createIndex({ day: 1, user_id: 1 }, { name: 'analytics_user_days_unique', unique: true }),
    db.collection('analytics_user_days').createIndex({ tenant_id: 1, day: 1 }, { name: 'analytics_user_days_tenant' }),
    db.collection('analytics_salts').createIndex({ expires_at: 1 }, { name: 'analytics_salts_ttl', expireAfterSeconds: 0 }),
    db.collection('analytics_caps').createIndex({ expires_at: 1 }, { name: 'analytics_caps_ttl', expireAfterSeconds: 0 }),
    db.collection('analytics_events').createIndex({ day: 1, event: 1 }, { name: 'analytics_events_day_event' }),
    db.collection('analytics_conversions_sent').createIndex({ at: 1 }, { name: 'analytics_conversions_sent_ttl', expireAfterSeconds: 30 * 86_400 }),
  ]).then(() => undefined)
}

export const eventsCol = () => col<RawEvent>('analytics_events')
export const sessionsCol = () => col<Document>('analytics_sessions')
export const rollupsCol = () => col<Document>('analytics_rollups')
export const userDaysCol = () => col<{ day: string; user_id: string; tenant_id: string | null; ts: Date }>('analytics_user_days')
export const capsCol = () => col<{ _id: string; n: number; expires_at: Date }>('analytics_caps')
export const stateCol = () => col<{ _id: string; [k: string]: unknown }>('analytics_state')
const saltsCol = () => col<{ _id: string; salt: string; expires_at: Date }>('analytics_salts')

export const dayKey = (d: Date) => d.toISOString().slice(0, 10)

const saltCache = new Map<string, string>()

/** The random salt for a UTC day (created on first use, shared by every replica, gone after 2 days). */
export async function dailySalt(day: string): Promise<string> {
  const hit = saltCache.get(day)
  if (hit) return hit
  const c = await saltsCol()
  const expires = new Date(Date.parse(`${day}T00:00:00.000Z`) + 2 * 86_400_000)
  await c.updateOne({ _id: day }, { $setOnInsert: { salt: randomBytes(32).toString('hex'), expires_at: expires } }, { upsert: true })
  const doc = await c.findOne({ _id: day })
  const salt = doc?.salt || randomBytes(32).toString('hex')
  if (saltCache.size > 4) saltCache.clear()
  saltCache.set(day, salt)
  return salt
}

/** Record that a signed-in user was active on a day (idempotent). */
export async function markUserDay(userId: string, tenantId: string | null | undefined, at: Date): Promise<void> {
  if (!userId) return
  const day = dayKey(at)
  try {
    await (await userDaysCol()).updateOne(
      { day, user_id: userId },
      { $setOnInsert: { day, user_id: userId, tenant_id: tenantId ?? null, ts: new Date(`${day}T00:00:00.000Z`) } },
      { upsert: true },
    )
  } catch (e) {
    if ((e as { code?: number })?.code !== 11000) throw e
  }
}
