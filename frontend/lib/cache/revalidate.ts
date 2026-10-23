/**
 * On-demand revalidation of cached public pages (ISR) and cached data
 * (unstable_cache tags) when content is published, edited or hidden.
 *
 * Call from route handlers or code they run (publish actions, the cron tick):
 * `revalidatePath` / `revalidateTag` need Next's request store. From the
 * in-process scheduler (no request) the call is a no-op and the route's
 * time-based `revalidate` refreshes the page instead. Never throws — a failed
 * cache purge must not fail a publish.
 *
 * Multi-instance: set CACHE_REDIS_URL (or REDIS_URL / UPSTASH_REDIS_REST_URL +
 * token) and next.config.mjs switches `cacheHandler` to
 * lib/cache/redis-cache-handler.mjs — entries and the tag manifest live in
 * Redis, so a purge on one replica reaches all of them. Without it each
 * instance keeps its own cache and the others catch up on their TTL (5–15 min).
 */

/** Cache tags for unstable_cache'd public data. */
export const CACHE_TAGS = {
  learn: 'public:learn',
  news: 'public:news',
  events: 'public:events',
  contests: 'public:contests',
  pricing: 'public:pricing',
  digest: 'public:digest',
} as const

export type ContentKind = keyof typeof CACHE_TAGS

/** Pure: the literal paths that show a piece of content of this kind. */
export function pathsFor(kind: ContentKind, slug?: string | null): string[] {
  const s = slug ? encodeURIComponent(slug) : null
  switch (kind) {
    case 'learn':
      return ['/learn', ...(s ? [`/learn/${s}`] : []), '/']
    case 'news':
      return ['/news', ...(s ? [`/news/${s}`, `/learn/${s}`] : []), '/learn']
    case 'events':
      return ['/events', ...(s ? [`/events/${s}`] : []), '/']
    case 'contests':
      return ['/contests', ...(s ? [`/contests/${s}`] : [])]
    case 'pricing':
      return ['/pricing']
    case 'digest':
      return ['/digest', ...(s ? [`/digest/${s}`, `/hi/digest/${s}`, `/te/digest/${s}`] : []), '/hi/digest', '/te/digest']
  }
}

/** Purge the cached pages + data for one item (or the whole listing). */
export async function revalidateContent(kind: ContentKind, slug?: string | null): Promise<void> {
  try {
    const { revalidatePath, revalidateTag } = await import('next/cache')
    // Stale-while-revalidate for data, fresh HTML on the next visit.
    revalidateTag(CACHE_TAGS[kind], 'max')
    for (const p of pathsFor(kind, slug)) revalidatePath(p)
    // Detail pages we can't name (e.g. renamed slugs): every page of the route.
    if (kind === 'learn' || kind === 'news') revalidatePath(`/${kind}/[slug]`, 'page')
    if (kind === 'events') revalidatePath('/events/[id]', 'page')
    if (kind === 'digest') revalidatePath('/digest/[date]', 'page')
  } catch {
    /* no request store (in-process scheduler) or not in a Next server: TTL covers it */
  }
}

/** Fire-and-forget form for code paths that must not await (never rejects). */
export function revalidateContentSoon(kind: ContentKind, slug?: string | null): void {
  void revalidateContent(kind, slug)
}
