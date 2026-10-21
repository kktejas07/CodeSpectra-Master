/**
 * Cached reads behind the /learn and /news listings. Those pages read
 * `searchParams` (filters, paging), so their HTML is rendered per request;
 * the Mongo queries are cached here instead (5 min, tag-purged on publish —
 * lib/cache/revalidate.ts). Free-text search (`q`) is never cached: unbounded
 * keys. Results are JSON-serialisable (ISO date strings, no ObjectIds).
 */
import 'server-only'
import { unstable_cache } from 'next/cache'
import { listHub } from '@/lib/learn/team-queries'
import { publishedSeries, type ListParams } from '@/lib/learn/queries'
import { listNews } from '@/lib/signals/news'
import { CACHE_TAGS } from './revalidate'

const TTL = 300

const hubCached = unstable_cache(async (p: ListParams) => listHub(p), ['public-learn-hub-v1'], {
  revalidate: TTL,
  tags: [CACHE_TAGS.learn, CACHE_TAGS.news],
})

const seriesCached = unstable_cache(async () => publishedSeries(), ['public-learn-series-v1'], {
  revalidate: TTL,
  tags: [CACHE_TAGS.learn],
})

const newsCached = unstable_cache(async (topic: string | null, page: number) => listNews({ topic, page }), ['public-news-list-v1'], {
  revalidate: TTL,
  tags: [CACHE_TAGS.news],
})

export function learnHubCached(p: ListParams): ReturnType<typeof listHub> {
  return p.q ? listHub(p) : hubCached(p)
}

export function learnSeriesCached(): Promise<string[]> {
  return seriesCached()
}

export function newsListCached(topic: string | null, page: number): ReturnType<typeof listNews> {
  return newsCached(topic, page)
}
