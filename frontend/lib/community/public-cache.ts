/**
 * Cached reads for the public forum pages (/community, /hi/community, …):
 * Next data cache tagged `public:community`, purged on every visible write
 * (service.revalidateCommunity). DB errors throw (never cache an outage);
 * unknown threads are not cached (hitOnly). Only public categories.
 */
import 'server-only'
import { unstable_cache } from 'next/cache'
import { hitOnly } from '@/lib/cache/public-data'
import { getCategory, getPublicThread, listCategories, listThreads, type ThreadSort } from './service'

export const COMMUNITY_TAG = 'public:community'
const TTL = 300

export const categoriesCached = unstable_cache(async () => listCategories(), ['community-categories-v1'], { revalidate: TTL, tags: [COMMUNITY_TAG] })

export const threadsCached = unstable_cache(
  async (categoryId: string | null, sort: ThreadSort, page: number) => listThreads({ categoryId, sort, page }),
  ['community-threads-v1'],
  { revalidate: TTL, tags: [COMMUNITY_TAG] },
)

export const categoryCached = hitOnly(async (slug: string) => {
  const c = await getCategory(slug)
  return c && !c.members_only ? c : null
}, 'community-category-v1', [COMMUNITY_TAG])

export const threadCached = hitOnly((id: string) => getPublicThread(id), 'community-thread-v1', [COMMUNITY_TAG])
