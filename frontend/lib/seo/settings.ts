/**
 * Server access to the SEO settings document (platform_settings, key `seo`).
 * Reads are cached per process for 60 s and never throw: any DB failure or
 * a slow DB (> 1.5 s) falls back to the last good value or the defaults —
 * cached for 30 s — so public pages, robots.txt and sitemaps keep serving.
 */
import { getMongoDb } from '@/lib/mongodb'
import { DEFAULT_SEO_SETTINGS, mergeSeoSettings, type SeoSettings } from './settings-shared'
import { resolveSiteUrl } from './site'
import { createTtlCache } from './ttl-cache'

export * from './settings-shared'

const KEY = 'seo'
const TTL_MS = 60_000

// W4-11: read on every render (root layout metadata + JSON-LD). Failures and
// timeouts are cached too, with a short timeout, so a Mongo outage never
// stalls page rendering (lib/seo/ttl-cache.ts).
const cache = createTtlCache<SeoSettings>(
  async () => {
    const db = await getMongoDb()
    const doc = await db.collection('platform_settings').findOne({ key: KEY }, { projection: { _id: 0, value: 1 }, maxTimeMS: 1500 })
    return mergeSeoSettings(doc?.value)
  },
  { ttlMs: TTL_MS, negativeTtlMs: 30_000, timeoutMs: 1_500, fallback: DEFAULT_SEO_SETTINGS },
)

export async function getSeoSettings(): Promise<SeoSettings> {
  return cache.get()
}

export async function saveSeoSettings(input: unknown, actorId: string): Promise<SeoSettings> {
  const value = mergeSeoSettings(input)
  const db = await getMongoDb()
  await db.collection('platform_settings').updateOne(
    { key: KEY },
    { $set: { key: KEY, value, updated_at: new Date().toISOString(), updated_by: actorId } },
    { upsert: true },
  )
  cache.set(value)
  return value
}

export function invalidateSeoSettingsCache(): void {
  cache.clear()
}

/** Site origin honouring the admin override. */
export async function getSiteOrigin(): Promise<string> {
  return resolveSiteUrl((await getSeoSettings()).site_url)
}
