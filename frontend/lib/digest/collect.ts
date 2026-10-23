/**
 * The aggregator's candidate pool for a digest (server only).
 *
 * The collectors already run around the clock — events feed (every minute),
 * tech news / signals (every 6 h), Learn publishing, contests, hackathons,
 * codeathons, certifications and company tests — and the Social studio queue
 * (lib/social/sync, every 30 min + publish hooks) holds every newly published
 * item. Here: refresh the queue (idempotent), read its last 14 days, add
 * events-feed listings that are older but still open for registration, and
 * enrich each row from its own collection + engagement (page views from the
 * analytics rollups, saved reminders, share clicks). Each source is read on
 * its own; one failing never blocks the rest.
 */
import 'server-only'
import { getMongoDb } from '@/lib/mongodb'
import { getAppOrigin } from '@/lib/app-origin'
import { BACKFILL_DAYS, fromFeedEvent, queueKey, type FeedRow } from '@/lib/social/queue'
import { toCandidate, type Enrichment, type PoolRow } from './candidates'
import type { DigestCandidate } from './types'

const DAY = 86_400_000
type Doc = Record<string, unknown>

export interface CollectReport { candidates: DigestCandidate[]; pool: number; failed: string[] }

const pathOf = (url: string) => { try { return new URL(url).pathname.replace(/\/+$/, '') } catch { return '' } }

export async function collectCandidates(now: Date, opts: { sync?: boolean } = {}): Promise<CollectReport> {
  const failed: string[] = []
  const safe = async <T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn() } catch (e) { failed.push(name); console.error(`[digest] collect ${name}:`, (e as Error)?.message); return fallback }
  }
  if (opts.sync !== false) await safe('social-sync', async () => (await import('@/lib/social/sync')).syncSocialQueue(now), null)
  const db = await getMongoDb()
  const origin = getAppOrigin()
  const since = new Date(now.getTime() - BACKFILL_DAYS * DAY).toISOString()

  // 1) the pool: Social studio queue (no roundups / digests).
  const pool = await safe('queue', async () => (await db.collection('social_queue')
    .find({ published_at: { $gte: since }, type: { $nin: ['roundup', 'digest'] } }, { projection: { _id: 0, captions: 0, posts: 0 } })
    .sort({ published_at: -1 }).limit(1500).toArray()) as unknown as PoolRow[], [] as PoolRow[])

  // 2) older events-feed listings still open for registration in the next 14 days.
  const extra = await safe('open-events', async () => {
    const rows = await db.collection('events_feed').find({
      status: 'published', internal: { $ne: true },
      registration_deadline: { $gte: now.toISOString(), $lte: new Date(now.getTime() + 14 * DAY).toISOString() },
    }, { projection: { _id: 0 } }).limit(300).toArray()
    return rows.map((r) => fromFeedEvent(r as unknown as FeedRow, origin, now)).filter((x): x is NonNullable<typeof x> => !!x).map((q) => ({
      key: queueKey(q.type, q.ref_id), type: q.type, ref_id: q.ref_id, title: q.title, summary: q.summary, url: q.url, source: q.source, facts: q.facts, published_at: q.published_at || now.toISOString(),
    } as PoolRow))
  }, [] as PoolRow[])
  const byKey = new Map<string, PoolRow>()
  for (const r of [...pool, ...extra]) if (r?.key && !byKey.has(r.key)) byKey.set(r.key, r)
  const rows = [...byKey.values()]

  // 3) enrichment from the items' own collections.
  const ids = (type: string) => rows.filter((r) => r.type === type).map((r) => r.ref_id)
  const feed = await safe('feed', async () => new Map((await db.collection('events_feed').find({ id: { $in: ids('event') } }, { projection: { _id: 0, id: 1, kind: 1, url: 1, location: 1, mode: 1, source: 1, prize: 1, status: 1, internal: 1, themes: 1, organiser: 1 } }).toArray()).map((d: Doc) => [String(d.id), d])), new Map<string, Doc>())
  const news = await safe('news', async () => new Map((await db.collection('blog_posts').find({ $or: [{ id: { $in: ids('news') } }, { slug: { $in: ids('news') } }] }, { projection: { _id: 0, id: 1, slug: 1, tags: 1, source_urls: 1, status: 1 } }).toArray()).flatMap((d: Doc) => [[String(d.id), d], [String(d.slug), d]] as [string, Doc][])), new Map<string, Doc>())
  const learnIds = ids('learn').filter((x) => !x.startsWith('blog:'))
  const learn = await safe('learn', async () => {
    const posts = await db.collection('learn_posts').find({ id: { $in: learnIds } }, { projection: { _id: 0, id: 1, category: 1, status: 1, stats: 1 } }).toArray()
    const tr = await db.collection('learn_posts').find({ translation_of: { $in: learnIds }, status: 'published' }, { projection: { _id: 0, translation_of: 1, locale: 1 } }).toArray()
    const locales = new Map<string, string[]>()
    for (const t of tr) locales.set(String(t.translation_of), [...(locales.get(String(t.translation_of)) || []), String(t.locale)])
    return new Map(posts.map((p: Doc) => [String(p.id), { ...p, locales: locales.get(String(p.id)) || [] }]))
  }, new Map<string, Doc>())

  // 4) engagement: page views (last 3 days), saved reminders, share clicks.
  const views = await safe('views', async () => {
    const { getTraffic } = await import('@/lib/analytics/query')
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY)
    return (await getTraffic({ from: new Date(to.getTime() - 3 * DAY), to, days: 3 })).paths as Record<string, number>
  }, {} as Record<string, number>)
  const saves = await safe('saves', async () => {
    const r = await db.collection('subscriptions').aggregate([{ $match: { 'saved_events.0': { $exists: true } } }, { $unwind: '$saved_events' }, { $group: { _id: '$saved_events', n: { $sum: 1 } } }, { $limit: 5000 }]).toArray()
    return new Map(r.map((x) => [String(x._id), Number(x.n) || 0]))
  }, new Map<string, number>())

  const candidates: DigestCandidate[] = []
  for (const r of rows) {
    const e: Enrichment = { engagement: { views: views[pathOf(r.url)] || 0 } }
    if (r.type === 'event') {
      const d = feed.get(r.ref_id)
      if (d) {
        const loc = (d.location || {}) as Doc
        const prize = (d.prize || null) as Doc | null
        e.feed = { kind: d.kind as string, url: d.url as string, country: loc.country as string, city: loc.city as string, mode: d.mode as string, source: d.source as string, prize_usd_minor: prize ? (prize.usd_minor as number) : null, status: d.status as string, internal: !!d.internal, themes: d.themes as string[], organiser: d.organiser as string }
      }
      e.engagement!.saves = saves.get(r.ref_id) || 0
    } else if (r.type === 'news') {
      const d = news.get(r.ref_id)
      if (d) e.news = { tags: d.tags as string[], source_urls: d.source_urls as string[], status: d.status as string }
    } else if (r.type === 'learn') {
      const d = learn.get(r.ref_id)
      if (d) {
        e.learn = { category: d.category as string, locales: d.locales as string[], status: d.status as string }
        const stats = (d.stats || {}) as Doc
        e.engagement!.clicks = Number(stats.share_total) || 0
      }
    }
    const c = toCandidate(r, e, now)
    if (c) candidates.push(c)
  }
  return { candidates, pool: rows.length, failed }
}

/** The item as it is now in its own collection (verifier evidence). null = gone / unpublished. */
export async function currentItem(c: Pick<DigestCandidate, 'source_type' | 'ref_id'>): Promise<{ status: 'ok' | 'gone'; deadline?: string | null; ends_at?: string | null; starts_at?: string | null } | null> {
  const db = await getMongoDb()
  const iso = (v: unknown) => (typeof v === 'string' && v ? v : null)
  switch (c.source_type) {
    case 'event': {
      const d = await db.collection('events_feed').findOne({ id: c.ref_id }, { projection: { _id: 0, status: 1, registration_deadline: 1, ends_at: 1, starts_at: 1 } })
      return d && d.status === 'published' ? { status: 'ok', deadline: iso(d.registration_deadline), ends_at: iso(d.ends_at), starts_at: iso(d.starts_at) } : null
    }
    case 'news': {
      const d = await db.collection('blog_posts').findOne({ $or: [{ id: c.ref_id }, { slug: c.ref_id }] }, { projection: { _id: 0, status: 1 } })
      return d && d.status === 'published' ? { status: 'ok' } : null
    }
    case 'learn': {
      if (c.ref_id.startsWith('blog:')) {
        const id = c.ref_id.slice(5)
        const d = await db.collection('blog_posts').findOne({ $or: [{ id }, { slug: id }] }, { projection: { _id: 0, status: 1 } })
        return d && d.status === 'published' ? { status: 'ok' } : null
      }
      const d = await db.collection('learn_posts').findOne({ id: c.ref_id }, { projection: { _id: 0, status: 1 } })
      return d && d.status === 'published' ? { status: 'ok' } : null
    }
    case 'contest': {
      const d = await db.collection('contests').findOne({ id: c.ref_id }, { projection: { _id: 0, status: 1, visibility: 1, schedule: 1 } })
      const s = (d?.schedule || {}) as Doc
      return d && d.status === 'published' && d.visibility === 'public' ? { status: 'ok', deadline: iso(s.registration_closes_at), ends_at: iso(s.ends_at), starts_at: iso(s.starts_at) } : null
    }
    default:
      // Hackathons, codeathons, certifications, company tests: the queue sync drops them when they end / unpublish.
      return { status: 'ok' }
  }
}
