/**
 * /learn — public Learn hub: search, filters (category, level, tag, series),
 * pagination. Server-rendered from published posts only. Also holds the
 * team's posts (blog_posts, "From the team", ?source=team&category=<blog
 * category>); news stays at /news. See lib/learn/team-posts.ts.
 * Body: ./learn-view.tsx (shared with /hi/learn and /te/learn).
 */
import type { Metadata } from 'next'
import { LearnView, learnMetadata, type SP } from './learn-view'

// Per-request HTML (filters / paging come from searchParams); the queries are
// cached for 5 min and purged on publish (lib/cache/public-data.ts).
export const dynamic = 'force-dynamic'

/**
 * Hub + one indexable page per category (?category=x, self-canonical). Search,
 * tag, level, series and page variants are noindex,follow so crawlers follow
 * the posts without indexing endless filter combinations.
 */
export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  return learnMetadata(searchParams, 'en')
}

export default function LearnPage({ searchParams }: { searchParams: SP }) {
  return <LearnView searchParams={searchParams} locale="en" />
}
