/**
 * Cached public certification catalog (Next data cache, same rules as
 * lib/mentors/public-cache.ts): one list entry (5 min TTL) shared by
 * /certifications and /certifications/[slug] in every language; a DB error
 * throws so an outage is never cached. Purged by tag on save / publish.
 */
import 'server-only'
import { unstable_cache } from 'next/cache'
import { loadPublishedPrograms } from './service'
import type { PublicProgram } from './types'

export const PRO_CERTS_TAG = 'public:pro-certs'

export const publishedProgramsCached = unstable_cache(
  async (): Promise<PublicProgram[]> => JSON.parse(JSON.stringify(await loadPublishedPrograms())),
  ['public-pro-certs-v1'],
  { revalidate: 300, tags: [PRO_CERTS_TAG] },
)

export async function programBySlugCached(slug: string): Promise<PublicProgram | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null
  return (await publishedProgramsCached()).find((p) => p.slug === slug) ?? null
}

/** Never throws (a failed purge must not fail the save). */
export async function revalidateProCerts(slug?: string | null): Promise<void> {
  try {
    const { revalidatePath, revalidateTag } = await import('next/cache')
    revalidateTag(PRO_CERTS_TAG, 'max')
    for (const pre of ['', '/hi', '/te']) {
      revalidatePath(`${pre}/certifications`)
      if (slug) revalidatePath(`${pre}/certifications/${encodeURIComponent(slug)}`)
    }
  } catch {
    /* outside a request store — the TTL refreshes it */
  }
}
