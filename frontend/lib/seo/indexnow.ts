/**
 * IndexNow (Bing, Yandex, Seznam, Naver…): tell search engines the moment
 * public content is published or changed.
 *
 * Decoupled from the publishers: a sweep (lib/scheduler.ts, every 10 min,
 * one replica) collects Learn posts, events, jobs, hackathons and marketplace
 * items whose updated_at is newer than the stored cursor and submits their
 * URLs in one batch. Idempotent: the cursor only advances after a successful
 * submit, and resubmitting a URL is harmless. Admins can also "Submit now".
 *
 * The key is served at /indexnow-key.txt (keyLocation), configured in
 * Admin → Settings → SEO & AI search.
 */
import { getMongoDb } from '@/lib/mongodb'
import { getSeoSettings } from './settings'
import { resolveSiteUrl } from './site'

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'
export const INDEXNOW_KEY_PATH = '/indexnow-key.txt'
const STATE_KEY = 'seo_indexnow_state'
const MAX_URLS = 10_000

export interface IndexNowPayload { host: string; key: string; keyLocation: string; urlList: string[] }

/** Pure: build the request body; keeps only same-host https URLs, de-duplicated. */
export function buildIndexNowPayload(site: string, key: string, urls: string[]): IndexNowPayload {
  const host = new URL(site).host
  const list = [...new Set(urls)].filter((u) => {
    try {
      const x = new URL(u)
      return x.host === host && (x.protocol === 'https:' || x.protocol === 'http:')
    } catch {
      return false
    }
  }).slice(0, MAX_URLS)
  return { host, key, keyLocation: `${site}${INDEXNOW_KEY_PATH}`, urlList: list }
}

/** Random 32-char hex key for the admin "Generate" button. */
export function generateIndexNowKey(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

export async function submitIndexNow(urls: string[], opts: { fetchImpl?: typeof fetch } = {}): Promise<{ ok: boolean; status: number | null; submitted: number; reason?: string }> {
  const seo = await getSeoSettings()
  if (!seo.indexnow_enabled || !seo.indexnow_key) return { ok: false, status: null, submitted: 0, reason: 'disabled' }
  const site = resolveSiteUrl(seo.site_url)
  const payload = buildIndexNowPayload(site, seo.indexnow_key, urls)
  if (!payload.urlList.length) return { ok: true, status: null, submitted: 0 }
  const f = opts.fetchImpl ?? fetch
  try {
    const res = await f(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    })
    // 200 OK / 202 Accepted (key validation pending) both count as delivered.
    return { ok: res.status === 200 || res.status === 202, status: res.status, submitted: payload.urlList.length }
  } catch (e) {
    return { ok: false, status: null, submitted: 0, reason: (e as Error)?.message?.slice(0, 120) || 'network' }
  }
}

/** URLs of public content changed since `sinceIso` (each source best-effort). */
export async function changedPublicUrls(site: string, sinceIso: string): Promise<string[]> {
  const db = await getMongoDb()
  const out: string[] = []
  const add = (p: string) => out.push(`${site}${p}`)
  const since = { $gt: sinceIso }
  await Promise.all([
    db.collection('learn_posts').find({ status: 'published', updated_at: since }, { projection: { _id: 0, slug: 1 } }).limit(2000).toArray()
      .then((r) => r.forEach((p) => add(`/learn/${encodeURIComponent(String(p.slug))}`))).catch(() => {}),
    db.collection('events_feed').find({ status: 'published', internal: { $ne: true }, updated_at: since }, { projection: { _id: 0, id: 1 } }).limit(2000).toArray()
      .then((r) => r.forEach((e) => add(`/events/${encodeURIComponent(String(e.id))}`))).catch(() => {}),
    db.collection('job_postings').find({ is_active: true, $or: [{ updated_at: since }, { created_at: since }] }, { projection: { _id: 0, id: 1 } }).limit(2000).toArray()
      .then((r) => r.forEach((j) => add(`/jobs/${encodeURIComponent(String(j.id))}`))).catch(() => {}),
    db.collection('hackathons').find({ status: { $in: ['open', 'live', 'closed'] }, updated_at: since }, { projection: { _id: 0, slug: 1 } }).limit(1000).toArray()
      .then((r) => r.forEach((h) => h.slug && add(`/hackathons/${encodeURIComponent(String(h.slug))}`))).catch(() => {}),
    db.collection('mkt_products').find({ status: 'published', updated_at: since }, { projection: { _id: 0, slug: 1 } }).limit(2000).toArray()
      .then((r) => r.forEach((p) => add(`/marketplace/p/${encodeURIComponent(String(p.slug))}`))).catch(() => {}),
    db.collection('blog_posts').find({ status: 'published', updated_at: since }, { projection: { _id: 0, slug: 1 } }).limit(1000).toArray()
      .then((r) => r.forEach((p) => add(`/blog/${encodeURIComponent(String(p.slug))}`))).catch(() => {}),
  ])
  return out
}

/** Scheduler entry point. Never throws. */
export async function runIndexNowSweep(now = new Date()): Promise<{ submitted: number; skipped?: string }> {
  try {
    const seo = await getSeoSettings()
    if (!seo.indexnow_enabled || !seo.indexnow_key) return { submitted: 0, skipped: 'disabled' }
    const db = await getMongoDb()
    const state = await db.collection('platform_settings').findOne({ key: STATE_KEY }, { projection: { _id: 0, value: 1 } })
    // First run: only the last day (not the whole history).
    const cursor = (state?.value as { cursor?: string } | undefined)?.cursor || new Date(now.getTime() - 86_400_000).toISOString()
    const site = resolveSiteUrl(seo.site_url)
    const urls = await changedPublicUrls(site, cursor)
    if (!urls.length) {
      await saveState(db, { cursor: now.toISOString(), last_run_at: now.toISOString(), last_submitted: 0 })
      return { submitted: 0 }
    }
    const r = await submitIndexNow(urls)
    if (r.ok) await saveState(db, { cursor: now.toISOString(), last_run_at: now.toISOString(), last_submitted: r.submitted, last_status: r.status })
    else await saveState(db, { cursor, last_run_at: now.toISOString(), last_submitted: 0, last_status: r.status, last_error: r.reason || `HTTP ${r.status}` })
    return { submitted: r.ok ? r.submitted : 0 }
  } catch (e) {
    console.error('[seo/indexnow] sweep failed:', (e as Error)?.message)
    return { submitted: 0, skipped: 'error' }
  }
}

async function saveState(db: Awaited<ReturnType<typeof getMongoDb>>, value: Record<string, unknown>) {
  await db.collection('platform_settings').updateOne({ key: STATE_KEY }, { $set: { key: STATE_KEY, value, updated_at: new Date().toISOString() } }, { upsert: true })
}

export async function getIndexNowState(): Promise<Record<string, unknown> | null> {
  try {
    const doc = await (await getMongoDb()).collection('platform_settings').findOne({ key: STATE_KEY }, { projection: { _id: 0, value: 1 } })
    return (doc?.value as Record<string, unknown>) ?? null
  } catch {
    return null
  }
}
