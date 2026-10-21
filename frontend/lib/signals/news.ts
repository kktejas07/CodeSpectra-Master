/**
 * Public tech news (/news) helpers. A news item is a published blog post with
 * the 'signals' tag (written by the Signals pipeline); its topic is the
 * `news:<topic>` tag, or for older posts the feed it came from. Pure parts are
 * client-safe; the queries import Mongo lazily.
 */
import { NEWS_TOPICS, SIGNAL_FEEDS, isNewsTopic, type NewsTopicId } from './feeds'

export const NEWS_TAG = 'signals'
export const NEWS_PAGE_SIZE = 12

/** Tags a published news post carries. */
export function newsTags(feedId: string, topic: string | undefined): string[] {
  return [...new Set([NEWS_TAG, feedId, `news:${isNewsTopic(topic) ? topic : 'industry'}`].filter(Boolean))]
}

/** Pure: a post's news topic from its tags. */
export function newsTopicOf(tags: readonly string[] | null | undefined): NewsTopicId {
  for (const t of tags || []) if (t.startsWith('news:') && isNewsTopic(t.slice(5))) return t.slice(5) as NewsTopicId
  for (const t of tags || []) { const f = SIGNAL_FEEDS.find((x) => x.id === t); if (f) return f.topic }
  return 'industry'
}

/** Pure: Mongo filter for a topic (old posts matched through their feed id). */
export function newsFilter(topic: string | null | undefined): Record<string, unknown> {
  const base: Record<string, unknown> = { status: 'published', tags: NEWS_TAG }
  if (!isNewsTopic(topic)) return base
  const feeds = SIGNAL_FEEDS.filter((f) => f.topic === topic).map((f) => f.id)
  return { ...base, $or: [{ tags: `news:${topic}` }, { tags: { $in: feeds } }] }
}

export function parseNewsParams(sp: Record<string, string | string[] | undefined>): { topic: NewsTopicId | null; page: number } {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const topic = one(sp.topic)
  const page = Math.max(1, Math.min(500, Number.parseInt(one(sp.page) || '1', 10) || 1))
  return { topic: isNewsTopic(topic) ? topic : null, page }
}

export interface NewsCard {
  slug: string
  title: string
  excerpt: string
  cover_image?: string
  topic: NewsTopicId
  source_note?: string
  source_urls?: string[]
  read_minutes: number
  published_at?: string | null
}

export async function listNews(opts: { topic?: string | null; page?: number; limit?: number }): Promise<{ items: NewsCard[]; total: number; page: number; pages: number }> {
  const { newsPostsCol } = await import('./store')
  const col = await newsPostsCol()
  const limit = Math.min(48, Math.max(1, opts.limit || NEWS_PAGE_SIZE))
  const page = Math.max(1, opts.page || 1)
  const filter = newsFilter(opts.topic)
  const [rows, total] = await Promise.all([
    col.find(filter, { projection: { _id: 0, body: 0 } }).sort({ published_at: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
    col.countDocuments(filter),
  ])
  return {
    items: rows.map((p) => ({ slug: p.slug, title: p.title, excerpt: p.excerpt, cover_image: p.cover_image, topic: newsTopicOf(p.tags), source_note: p.source_note, source_urls: p.source_urls, read_minutes: p.read_minutes, published_at: p.published_at })),
    total, page, pages: Math.max(1, Math.ceil(total / limit)),
  }
}

export async function getNewsPost(slug: string) {
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return null
  const { newsPostsCol } = await import('./store')
  return (await newsPostsCol()).findOne({ slug, status: 'published', tags: NEWS_TAG }, { projection: { _id: 0 } })
}

export { NEWS_TOPICS }
