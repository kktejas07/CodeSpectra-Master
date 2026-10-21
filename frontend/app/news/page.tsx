/**
 * /news — public tech news (Signals): topic filter, pagination, RSS, an
 * ItemList of NewsArticle JSON-LD, and the daily digest sign-up. Separate from
 * /learn ("From the team" product posts). Server-rendered from published items only.
 * Body: ./news-view.tsx (shared with /hi/news and /te/news).
 */
import type { Metadata } from 'next'
import { NewsView, newsMetadata, type SP } from './news-view'

// Per-request HTML (topic / page come from searchParams); the query is cached
// for 5 min and purged on publish (lib/cache/public-data.ts).
export const dynamic = 'force-dynamic'

/** Hub + one indexable page per topic (self-canonical); deeper pages are noindex,follow. */
export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  return newsMetadata(searchParams, 'en')
}

export default function NewsPage({ searchParams }: { searchParams: SP }) {
  return <NewsView searchParams={searchParams} locale="en" />
}
