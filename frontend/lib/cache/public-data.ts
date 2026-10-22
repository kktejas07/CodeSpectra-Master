/**
 * Cached public reads (Next data cache, `unstable_cache` with tags — the
 * "Caching (Previous Model)" guide in node_modules/next/dist/docs/01-app/02-guides/
 * caching-without-cache-components.md; this app does not enable cacheComponents).
 *
 * Why data cache instead of route ISR for DB-backed pages: the production build
 * (Dokploy, CI) has no database, so a prerendered page would ship an empty
 * placeholder. Pages using these loaders render per request (cheap — the DB is
 * hit at most once per TTL per key), the first request fills the cache, and
 * publish actions purge it by tag (lib/cache/revalidate.ts).
 *
 * Rules:
 *  - A DB error throws (loaders use `strict` modes), so nothing is cached and a
 *    stale entry keeps being served (unstable_cache is stale-while-revalidate);
 *    an outage is never cached as "no events".
 *  - Detail loaders cache hits only (`hitOnly`): an unknown slug renders 404
 *    without writing a cache entry, so random URLs cannot fill the cache —
 *    entries are bounded by the number of published items.
 *  - Free-text search (`q`) is never cached (unbounded keys).
 * Results are JSON-serialisable (ISO date strings, no ObjectIds).
 */
import 'server-only'
import { unstable_cache } from 'next/cache'
import { listHub, relatedTeam, resolveLearnSlug } from '@/lib/learn/team-queries'
import { getPublishedPost, listPublished, publishedSeries, relatedPosts, type ListParams } from '@/lib/learn/queries'
import { getNewsPost, listNews } from '@/lib/signals/news'
import { getFeedEvent, listPublishedFeed } from '@/lib/events-feed/query'
import { toPublic } from '@/lib/events-feed/public'
import type { PublicFeedEvent } from '@/lib/events-feed/types'
import { listPublicContests } from '@/lib/contests/participation'
import { getClientPlans } from '@/lib/pricing-catalog-server'
import { CACHE_TAGS } from './revalidate'

const LIST_TTL = 300
const DETAIL_TTL = 900

const MISS = '__cs_cache_miss__'

/** Pure-ish wrapper: cache non-null results only; a null result throws a marker the caller turns back into null. */
export function hitOnly<A extends unknown[], T>(
  fn: (...args: A) => Promise<T | null | undefined>,
  key: string,
  tags: string[],
  ttl = DETAIL_TTL,
  cache: typeof unstable_cache = unstable_cache,
): (...args: A) => Promise<T | null> {
  const cached = cache(async (...args: A) => {
    const v = await fn(...args)
    if (v === null || v === undefined) throw new Error(MISS)
    return v
  }, [key], { revalidate: ttl, tags })
  return async (...args: A) => {
    try {
      return (await cached(...args)) as T
    } catch (e) {
      if ((e as Error)?.message === MISS) return null
      throw e
    }
  }
}

// ─── Listings ────────────────────────────────────────────────────────────────

const hubCached = unstable_cache(async (p: ListParams) => listHub(p), ['public-learn-hub-v1'], { revalidate: LIST_TTL, tags: [CACHE_TAGS.learn, CACHE_TAGS.news] })
const seriesCached = unstable_cache(async () => publishedSeries(), ['public-learn-series-v1'], { revalidate: LIST_TTL, tags: [CACHE_TAGS.learn] })
const newsCached = unstable_cache(async (topic: string | null, page: number) => listNews({ topic, page }), ['public-news-list-v1'], { revalidate: LIST_TTL, tags: [CACHE_TAGS.news] })

export function learnHubCached(p: ListParams): ReturnType<typeof listHub> {
  return p.q ? listHub(p) : hubCached(p)
}
export function learnSeriesCached(): Promise<string[]> {
  return seriesCached()
}
export function newsListCached(topic: string | null, page: number): ReturnType<typeof listNews> {
  return newsCached(topic, page)
}

/** /events and the landing strip (upcoming filter applied at fill time; 5 min TTL). */
export const eventsFeedCached = unstable_cache(async () => listPublishedFeed(new Date(), 1000, { strict: true }), ['public-events-feed-v1'], { revalidate: LIST_TTL, tags: [CACHE_TAGS.events] })

/** Landing "Learn" strip: featured first, then latest (max 3). */
export const landingPostsCached = unstable_cache(async () => {
  const [featured, latest] = await Promise.all([listPublished({ featured: true, limit: 3 }), listPublished({ limit: 3 })])
  const seen = new Set<string>()
  return [...featured.items, ...latest.items].filter((p) => !seen.has(p.slug) && seen.add(p.slug)).slice(0, 3)
}, ['public-landing-posts-v1'], { revalidate: LIST_TTL * 2, tags: [CACHE_TAGS.learn] })

/** /contests rows (phase is computed at render, not cached). */
export const publicContestsCached = unstable_cache(async () => listPublicContests({ includeEnded: true }), ['public-contests-v1'], { revalidate: LIST_TTL, tags: [CACHE_TAGS.contests] })

/** /pricing plans; DB errors throw (no cached catalogue fallback). */
export const pricingPlansCached = unstable_cache(async () => JSON.parse(JSON.stringify(await getClientPlans({ strict: true }))) as Awaited<ReturnType<typeof getClientPlans>>, ['public-pricing-plans-v2'], { revalidate: DETAIL_TTL, tags: [CACHE_TAGS.pricing] })

// ─── Detail pages (hits only) ────────────────────────────────────────────────

export const newsPostCached = hitOnly((slug: string) => getNewsPost(slug), 'public-news-post-v1', [CACHE_TAGS.news])

export const feedEventCached = hitOnly(async (id: string): Promise<PublicFeedEvent | null> => {
  const doc = await getFeedEvent(id)
  if (doc) return doc.status === 'hidden' ? null : toPublic(doc)
  return (await listPublishedFeed(new Date(), 1000, { strict: true })).find((e) => e.id === id) || null
}, 'public-feed-event-v1', [CACHE_TAGS.events], 600)

export const learnPostCached = hitOnly((slug: string) => getPublishedPost(slug), 'public-learn-post-v1', [CACHE_TAGS.learn])

/** /learn/<slug> that isn't a Learn post: team post or redirect (not_found is not cached). */
export const learnSlugCached = hitOnly(async (slug: string) => {
  const r = await resolveLearnSlug(slug, false)
  return r.decision.kind === 'not_found' ? null : r
}, 'public-learn-slug-v1', [CACHE_TAGS.learn, CACHE_TAGS.news])

export const learnRelatedCached = unstable_cache(async (slug: string) => {
  const post = await getPublishedPost(slug)
  return post ? relatedPosts(post) : []
}, ['public-learn-related-v1'], { revalidate: DETAIL_TTL, tags: [CACHE_TAGS.learn] })

export const teamRelatedCached = unstable_cache(async (slug: string) => {
  const r = await resolveLearnSlug(slug, false)
  return r.post ? relatedTeam(r.post) : []
}, ['public-team-related-v1'], { revalidate: DETAIL_TTL, tags: [CACHE_TAGS.learn, CACHE_TAGS.news] })
