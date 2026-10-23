/**
 * Cached public reads for /digest (same rules as lib/cache/public-data.ts):
 * DB errors throw (nothing cached), detail loader caches hits only, purged on
 * publish by tag `public:digest` (lib/cache/revalidate).
 */
import 'server-only'
import { unstable_cache } from 'next/cache'
import { hitOnly } from '@/lib/cache/public-data'
import { CACHE_TAGS } from '@/lib/cache/revalidate'
import { getDigest, listDigests } from './store'

export const digestListCached = unstable_cache(async (page: number) => listDigests({ publishedOnly: true, limit: 30, skip: (page - 1) * 30 }), ['public-digest-list-v1'], { revalidate: 300, tags: [CACHE_TAGS.digest] })

export const digestCached = hitOnly((date: string) => getDigest(date, { publishedOnly: true }), 'public-digest-v1', [CACHE_TAGS.digest])

/** The newest published digest (learner home card, /digest hero). */
export const latestDigestCached = unstable_cache(async () => {
  const { rows } = await listDigests({ publishedOnly: true, limit: 1 })
  return rows[0] ? await getDigest(rows[0].date, { publishedOnly: true }) : null
}, ['public-digest-latest-v1'], { revalidate: 300, tags: [CACHE_TAGS.digest] })
