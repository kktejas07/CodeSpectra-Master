/**
 * W4-11: a small read-through cache for settings read on every page render.
 *
 *  - fresh value → returned straight away (TTL);
 *  - stale value → returned straight away, refreshed in the background;
 *  - no value yet → the loader is awaited, but never longer than `timeoutMs`;
 *  - a failure or timeout caches the fallback (or the last good value) for
 *    `negativeTtlMs`, so a database outage costs one short wait per window,
 *    not one per render;
 *  - concurrent callers share a single in-flight load.
 */
export interface TtlCacheOptions<T> {
  ttlMs: number
  negativeTtlMs: number
  timeoutMs: number
  fallback: T
  now?: () => number
}

export interface TtlCache<T> {
  get(): Promise<T>
  set(value: T): void
  clear(): void
}

export function createTtlCache<T>(loader: () => Promise<T>, opts: TtlCacheOptions<T>): TtlCache<T> {
  const now = opts.now ?? Date.now
  let entry: { value: T; until: number; good: boolean } | null = null
  let inflight: Promise<T> | null = null

  const load = (): Promise<T> => {
    if (inflight) return inflight
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('settings load timed out')), opts.timeoutMs)
    })
    inflight = Promise.race([loader(), timeout])
      .then((value) => {
        entry = { value, until: now() + opts.ttlMs, good: true }
        return value
      })
      .catch(() => {
        const value = entry?.good ? entry.value : opts.fallback
        entry = { value, until: now() + opts.negativeTtlMs, good: entry?.good ?? false }
        return value
      })
      .finally(() => {
        if (timer) clearTimeout(timer)
        inflight = null
      })
    return inflight
  }

  return {
    async get() {
      if (entry && now() < entry.until) return entry.value
      if (entry) {
        void load() // stale-while-revalidate
        return entry.value
      }
      return load()
    },
    set(value: T) {
      entry = { value, until: now() + opts.ttlMs, good: true }
    },
    clear() {
      entry = null
    },
  }
}
