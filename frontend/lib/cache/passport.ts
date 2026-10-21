/**
 * Cached public passport reads (same rules as lib/cache/public-data.ts):
 * hits only (an unknown or private handle is never cached, so random URLs
 * can't fill the cache), DB errors throw (an outage is never cached), and
 * every settings change purges the handle's tag (revalidatePassport).
 */
import 'server-only'
import { unstable_cache } from 'next/cache'
import { loadPublicPassport, type PublicPassportView } from '@/lib/passport/db'

export const PASSPORT_TAG = 'public:passport'
export const passportTag = (handle: string) => `${PASSPORT_TAG}:${handle}`
const TTL = 900
const MISS = '__cs_passport_miss__'

export async function publicPassportCached(handle: string, site: string): Promise<PublicPassportView | null> {
  const cached = unstable_cache(
    async () => {
      const v = await loadPublicPassport(handle, site)
      if (!v) throw new Error(MISS)
      return v
    },
    ['public-passport-v1', handle, site],
    { revalidate: TTL, tags: [PASSPORT_TAG, passportTag(handle)] },
  )
  try {
    return await cached()
  } catch (e) {
    if ((e as Error)?.message === MISS) return null
    throw e
  }
}

/** Purge one or more handles' cached pages. Never throws. */
export async function revalidatePassport(...handles: Array<string | null | undefined>): Promise<void> {
  try {
    const { revalidateTag, revalidatePath } = await import('next/cache')
    for (const h of new Set(handles.filter((x): x is string => !!x))) {
      // expire: 0 — a passport made private must never be served stale.
      revalidateTag(passportTag(h), { expire: 0 })
      revalidatePath(`/p/${h}`)
    }
  } catch {
    /* outside a request: the TTL refreshes it */
  }
}
