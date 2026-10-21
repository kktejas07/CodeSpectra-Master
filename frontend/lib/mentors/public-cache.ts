/**
 * Cached public mentor directory (Next data cache, same rules as lib/cache/public-data.ts):
 * one list entry (5 min TTL) shared by /mentors and /mentors/[slug]; a DB error throws so an
 * outage is never cached; filters run in memory so free text never creates cache keys.
 * Purged by tag when a mentor, an offering or availability changes.
 */
import 'server-only'
import { unstable_cache } from 'next/cache'
import { loadDirectory } from './service'
import type { PublicMentor } from './types'

export const MENTORS_TAG = 'public:mentors'

export const mentorDirectoryCached = unstable_cache(async (): Promise<PublicMentor[]> => JSON.parse(JSON.stringify(await loadDirectory())), ['public-mentors-v1'], { revalidate: 300, tags: [MENTORS_TAG] })

export async function mentorBySlugCached(slug: string): Promise<PublicMentor | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null
  return (await mentorDirectoryCached()).find((m) => m.slug === slug) ?? null
}

/** Never throws (a failed purge must not fail the save); no-op outside a request. */
export async function revalidateMentorDirectory(slug?: string | null): Promise<void> {
  try {
    const { revalidatePath, revalidateTag } = await import('next/cache')
    revalidateTag(MENTORS_TAG, 'max')
    revalidatePath('/mentors')
    if (slug) revalidatePath(`/mentors/${encodeURIComponent(slug)}`)
  } catch {
    /* outside a request store (scheduler) — the TTL refreshes it */
  }
}
