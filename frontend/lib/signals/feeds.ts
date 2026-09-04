/**
 * Curated public feeds for Signals ingest.
 * Do NOT scrape Unstop/closed sites — only public RSS.
 */
import type { BlogCategoryId } from '@/lib/blog-categories'

export const SIGNAL_FEEDS: {
  id: string
  name: string
  url: string
  category: BlogCategoryId
}[] = [
  {
    id: 'hn-frontpage',
    name: 'Hacker News',
    url: 'https://hnrss.org/frontpage',
    category: 'signals',
  },
  {
    id: 'github-blog',
    name: 'GitHub Blog',
    url: 'https://github.blog/feed/',
    category: 'engineering',
  },
  {
    id: 'devto-top',
    name: 'DEV Community',
    url: 'https://dev.to/feed',
    category: 'careers',
  },
  {
    id: 'techcrunch-ai',
    name: 'TechCrunch AI',
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
    category: 'signals',
  },
  {
    id: 'the-verge-ai',
    name: 'The Verge AI',
    url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
    category: 'signals',
  },
  {
    id: 'arstechnica-ai',
    name: 'Ars Technica AI',
    url: 'https://feeds.arstechnica.com/arstechnica/technology-lab',
    category: 'engineering',
  },
]
