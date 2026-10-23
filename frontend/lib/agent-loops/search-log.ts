/**
 * Search-demand log for the SEO / content gap loop (server only).
 *
 *   search_query_stats  one row per normalised query: counts by source, last seen, TTL 90 days
 *
 * Privacy: only the normalised query text (lib/agent-loops/pure/seo-gap
 * normalizeQuery strips emails, URLs, phone and long numbers) and counters are
 * kept — no user id, IP, session or answer. Queries the prompt guard flags are
 * not stored. Writes are fire-and-forget and never slow the search itself.
 */
import 'server-only'
import { createHash } from 'node:crypto'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { normalizeQuery, queryLocale, type QueryLocale, type QueryStat } from './pure/seo-gap'

interface QueryRow {
  key: string
  q: string
  locale: QueryLocale
  ask: number
  gsc_impressions: number
  zero_hits: number
  first_seen: string
  last_seen: string
  expires_at: Date
}

const KEEP_MS = 90 * 86_400_000

let built: Promise<unknown> | null = null
async function col(): Promise<Collection<QueryRow>> {
  const c = (await getMongoDb()).collection<QueryRow>('search_query_stats')
  if (!built) {
    built = Promise.all([
      c.createIndex({ key: 1 }, { unique: true, name: 'sqs_key' }),
      c.createIndex({ last_seen: -1 }, { name: 'sqs_last_seen' }),
      c.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'sqs_ttl' }),
    ]).catch((e) => { built = null; console.error('[search-log] index:', (e as Error)?.message) })
  }
  await built
  return c
}

const keyOf = (q: string) => createHash('sha1').update(q).digest('hex').slice(0, 24)

async function bump(raw: string, inc: { ask?: number; gsc_impressions?: number; zero_hits?: number }, now = new Date()): Promise<boolean> {
  const q = normalizeQuery(raw)
  if (!q) return false
  const { scanUntrusted } = await import('@/lib/ai/untrusted-input')
  if (scanUntrusted(q).flagged) return false
  const ts = now.toISOString()
  await (await col()).updateOne(
    { key: keyOf(q) },
    { $inc: { ask: inc.ask ?? 0, gsc_impressions: inc.gsc_impressions ?? 0, zero_hits: inc.zero_hits ?? 0 }, $set: { last_seen: ts, expires_at: new Date(now.getTime() + KEEP_MS) }, $setOnInsert: { key: keyOf(q), q, locale: queryLocale(q), first_seen: ts } },
    { upsert: true },
  )
  return true
}

/** The public Ask box (lib/public-ask/service.ts): one search with `hits` results. Never throws. */
export function recordAskQuery(raw: string, hits: number): void {
  void bump(raw, { ask: 1, zero_hits: hits === 0 ? 1 : 0 }).catch(() => undefined)
}

/** Admin paste of a Search Console queries export. Returns how many rows were kept. */
export async function importSearchConsole(rows: readonly { q: string; impressions: number }[]): Promise<number> {
  let kept = 0
  for (const r of rows.slice(0, 2000)) if (await bump(r.q, { gsc_impressions: Math.min(100_000, r.impressions) }).catch(() => false)) kept++
  return kept
}

/**
 * Demand per query over the last `days`: an Ask counts 5, Search Console
 * impressions count their square root (so a few big queries don't drown out
 * what people type here), zero-result asks count double.
 */
export async function recentQueryStats(days = 30, limit = 1000, now = new Date()): Promise<QueryStat[]> {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString()
  const rows = await (await col()).find({ last_seen: { $gte: since } }, { projection: { _id: 0 } }).sort({ last_seen: -1 }).limit(limit).toArray()
  return rows.map((r) => ({ key: r.key, q: r.q, locale: r.locale, zero_hits: r.zero_hits, count: (r.ask || 0) * 5 + (r.zero_hits || 0) * 5 + Math.ceil(Math.sqrt(r.gsc_impressions || 0)) }))
}

export async function queryStatsSummary(): Promise<{ queries: number; last_seen: string | null }> {
  const c = await col()
  const [queries, last] = await Promise.all([c.estimatedDocumentCount(), c.find({}, { projection: { _id: 0, last_seen: 1 } }).sort({ last_seen: -1 }).limit(1).toArray()])
  return { queries, last_seen: last[0]?.last_seen ?? null }
}
