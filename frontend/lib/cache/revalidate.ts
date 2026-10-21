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
 * Multi-instance: production runs ONE Next.js instance today, so the data
 * cache (.next/cache/fetch-cache) and the purge are consistent. With several
 * replicas each keeps its own cache: a purge only reaches the instance that
 * handled the publish and the others catch up on their TTL (5–15 min). To share
 * it, point `cacheHandler` in next.config.mjs at a Redis-backed handler
 * (node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/
 * incrementalCacheHandlerPath.md: get / set / revalidateTag) reusing the
 * self-hosted Redis that lib/upstash-rate-limit.ts already talks to (ioredis,
 * REDIS_URL / Settings → Redis), with cacheMaxMemorySize: 0. Not implemented.
 */

/** Cache tags for unstable_cache'd public data. */
export const CACHE_TAGS = {
  learn: 'public:learn',
  news: 'public:news',
  events: 'public:events',
  contests: 'public:contests',
  pricing: 'public:pricing',
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
  } catch {
    /* no request store (in-process scheduler) or not in a Next server: TTL covers it */
  }
}

/** Fire-and-forget form for code paths that must not await (never rejects). */
export function revalidateContentSoon(kind: ContentKind, slug?: string | null): void {
  void revalidateContent(kind, slug)
}
