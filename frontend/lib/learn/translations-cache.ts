/**
 * Cached language versions of a published Learn post (hreflang alternates and
 * the language links on /learn/[slug]). Same data cache + `learn` tag as the
 * other Learn loaders (lib/cache/public-data.ts): purged on publish, DB errors
 * throw instead of caching an empty list.
 */
import 'server-only'
import { unstable_cache } from 'next/cache'
import { CACHE_TAGS } from '@/lib/cache/revalidate'
import { publishedTranslations } from './queries'

export const learnTranslationsCached = unstable_cache(
  async (id: string, translationOf: string | null) => publishedTranslations({ id, translation_of: translationOf }),
  ['public-learn-translations-v1'],
  { revalidate: 900, tags: [CACHE_TAGS.learn] },
)

/** hreflang map for Next metadata `alternates.languages` (pure). */
export function hreflangMap(versions: Array<{ slug: string; locale?: string | null }>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const v of versions) {
    const l = v.locale || 'en'
    const tag = l === 'en' ? 'en' : `${l}-IN`
    out[tag] = `/learn/${encodeURIComponent(v.slug)}`
  }
  if (out.en) out['x-default'] = out.en
  return Object.keys(out).length > 2 ? out : {}
}
