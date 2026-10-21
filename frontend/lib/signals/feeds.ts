/**
 * Curated public feeds for Signals (tech news) ingest. Client-safe.
 * Do NOT scrape Unstop/closed sites — only public RSS / Atom feeds.
 *
 * `trusted`: an official / primary source (vendor blog, language release
 * notes, government advisories). New items from trusted feeds are published
 * automatically (owner's decision); untrusted ones wait for an admin in
 * /dashboard/admin/signals. Admins can flip trust or turn a feed off there
 * (overrides live in `signal_feed_state`).
 */
import type { BlogCategoryId } from '@/lib/blog-categories'

export const NEWS_TOPICS = [
  { id: 'industry', label: 'Industry' },
  { id: 'ai', label: 'AI' },
  { id: 'india-careers', label: 'India tech & careers' },
  { id: 'cloud', label: 'Cloud' },
  { id: 'security', label: 'Security' },
  { id: 'languages', label: 'Languages & releases' },
  { id: 'dev-tools', label: 'Developer tools' },
] as const
export type NewsTopicId = (typeof NEWS_TOPICS)[number]['id']

export function isNewsTopic(v: unknown): v is NewsTopicId {
  return typeof v === 'string' && NEWS_TOPICS.some((t) => t.id === v)
}
export function newsTopicLabel(id: string): string {
  return NEWS_TOPICS.find((t) => t.id === id)?.label ?? id
}

export interface SignalFeed {
  id: string
  name: string
  url: string
  category: BlogCategoryId
  topic: NewsTopicId
  /** Official / primary source → auto-publish. */
  trusted: boolean
}

export const SIGNAL_FEEDS: SignalFeed[] = [
  // General tech news (secondary reporting → admin review).
  { id: 'hn-frontpage', name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'signals', topic: 'industry', trusted: false },
  { id: 'github-blog', name: 'GitHub Blog', url: 'https://github.blog/feed/', category: 'engineering', topic: 'dev-tools', trusted: true },
  { id: 'devto-top', name: 'DEV Community', url: 'https://dev.to/feed', category: 'careers', topic: 'dev-tools', trusted: false },
  { id: 'techcrunch-ai', name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', category: 'signals', topic: 'ai', trusted: false },
  { id: 'the-verge-ai', name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', category: 'signals', topic: 'ai', trusted: false },
  { id: 'arstechnica-ai', name: 'Ars Technica AI', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', category: 'engineering', topic: 'ai', trusted: false },
  // India tech & careers.
  { id: 'inc42', name: 'Inc42', url: 'https://inc42.com/feed/', category: 'careers', topic: 'india-careers', trusted: false },
  { id: 'et-tech', name: 'ET Tech', url: 'https://economictimes.indiatimes.com/tech/rssfeeds/13357270.cms', category: 'careers', topic: 'india-careers', trusted: false },
  { id: 'medianama', name: 'MediaNama', url: 'https://www.medianama.com/feed/', category: 'signals', topic: 'india-careers', trusted: false },
  // Cloud vendor blogs (primary sources).
  { id: 'aws-news', name: 'AWS News Blog', url: 'https://aws.amazon.com/blogs/aws/feed/', category: 'devops', topic: 'cloud', trusted: true },
  { id: 'azure-blog', name: 'Microsoft Azure Blog', url: 'https://azure.microsoft.com/en-us/blog/feed/', category: 'devops', topic: 'cloud', trusted: true },
  { id: 'gcp-blog', name: 'Google Cloud Blog', url: 'https://cloudblog.withgoogle.com/rss/', category: 'devops', topic: 'cloud', trusted: true },
  { id: 'kubernetes-blog', name: 'Kubernetes Blog', url: 'https://kubernetes.io/feed.xml', category: 'devops', topic: 'cloud', trusted: true },
  // Security advisories.
  { id: 'cisa-advisories', name: 'CISA cybersecurity advisories', url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml', category: 'engineering', topic: 'security', trusted: true },
  { id: 'github-security', name: 'GitHub Blog: Security', url: 'https://github.blog/security/feed/', category: 'engineering', topic: 'security', trusted: true },
  // Language and runtime releases.
  { id: 'python-insider', name: 'Python Insider', url: 'https://blog.python.org/feeds/posts/default?alt=rss', category: 'engineering', topic: 'languages', trusted: true },
  { id: 'nodejs-blog', name: 'Node.js blog', url: 'https://nodejs.org/en/feed/blog.xml', category: 'engineering', topic: 'languages', trusted: true },
  { id: 'go-blog', name: 'The Go Blog', url: 'https://go.dev/blog/feed.atom', category: 'engineering', topic: 'languages', trusted: true },
  { id: 'rust-blog', name: 'Rust Blog', url: 'https://blog.rust-lang.org/feed.xml', category: 'engineering', topic: 'languages', trusted: true },
  { id: 'typescript-blog', name: 'TypeScript blog', url: 'https://devblogs.microsoft.com/typescript/feed/', category: 'engineering', topic: 'languages', trusted: true },
  { id: 'kotlin-blog', name: 'Kotlin blog', url: 'https://blog.jetbrains.com/kotlin/feed/', category: 'engineering', topic: 'languages', trusted: true },
  { id: 'inside-java', name: 'Inside Java', url: 'https://inside.java/feed.xml', category: 'engineering', topic: 'languages', trusted: true },
]

/** Feed state an admin can change (stored in `signal_feed_state`). */
export interface SignalFeedState {
  id: string
  /** null = use the feed's default. */
  trusted: boolean | null
  enabled: boolean
  last_run_at?: string | null
  last_ok_at?: string | null
  last_error?: string | null
  last_created?: number
  updated_at?: string
  updated_by?: string | null
}

/** Pure: effective feeds (defaults + admin overrides), least recently run first so caps rotate fairly. */
export function effectiveFeeds(states: readonly Pick<SignalFeedState, 'id' | 'trusted' | 'enabled' | 'last_run_at'>[]): (SignalFeed & { enabled: boolean; last_run_at: string | null })[] {
  const byId = new Map(states.map((s) => [s.id, s]))
  return SIGNAL_FEEDS.map((f) => {
    const s = byId.get(f.id)
    return { ...f, trusted: typeof s?.trusted === 'boolean' ? s.trusted : f.trusted, enabled: s ? s.enabled !== false : true, last_run_at: s?.last_run_at ?? null }
  }).sort((a, b) => (a.last_run_at || '').localeCompare(b.last_run_at || ''))
}
