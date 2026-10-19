/**
 * Public read queries for the Learn hub (published posts only). Server only.
 */
import type { Filter } from 'mongodb'
import { sanitizeRegex } from '@/lib/sanitize'
import { CARD_PROJECTION, learnPosts } from './store'
import { isLearnCategory, isLearnLevel, type LearnPostCard, type LearnPostDoc } from './types'

export interface ListParams {
  q?: string | null
  category?: string | null
  level?: string | null
  tag?: string | null
  series?: string | null
  featured?: boolean
  page?: number
  limit?: number
}

export function parseListParams(sp: URLSearchParams | Record<string, string | string[] | undefined>): ListParams {
  const get = (k: string): string | null => {
    if (sp instanceof URLSearchParams) return sp.get(k)
    const v = sp[k]
    return Array.isArray(v) ? v[0] ?? null : v ?? null
  }
  return {
    q: get('q'),
    category: get('category'),
    level: get('level'),
    tag: get('tag'),
    series: get('series'),
    featured: get('featured') === '1',
    page: Number(get('page')) || 1,
    limit: Number(get('limit')) || undefined,
  }
}

export async function listPublished(p: ListParams): Promise<{ items: LearnPostCard[]; total: number; page: number; pages: number }> {
  const filter: Filter<LearnPostDoc> = { status: 'published' }
  if (isLearnCategory(p.category)) filter.category = p.category
  if (isLearnLevel(p.level)) filter.level = p.level
  const tag = typeof p.tag === 'string' ? p.tag.trim().toLowerCase().slice(0, 40) : ''
  if (tag) filter.tags = tag
  const series = typeof p.series === 'string' ? p.series.trim().slice(0, 80) : ''
  if (series) filter.series = series
  if (p.featured) filter.featured = true
  const q = typeof p.q === 'string' ? p.q.trim().slice(0, 80) : ''
  if (q) {
    const re = new RegExp(sanitizeRegex(q), 'i')
    filter.$or = [{ title: re }, { summary: re }, { tags: re }]
  }
  const limit = Math.max(1, Math.min(48, Math.floor(p.limit ?? 12)))
  const page = Math.max(1, Math.min(500, Math.floor(p.page ?? 1)))
  const col = await learnPosts()
  const sort: Record<string, 1 | -1> = series ? { series_order: 1, published_at: 1 } : { published_at: -1 }
  const [items, total] = await Promise.all([
    col.find(filter, { projection: CARD_PROJECTION }).sort(sort).skip((page - 1) * limit).limit(limit).toArray(),
    col.countDocuments(filter),
  ])
  return { items: items as LearnPostCard[], total, page, pages: Math.max(1, Math.ceil(total / limit)) }
}

export async function getPublishedPost(slug: string): Promise<LearnPostDoc | null> {
  if (!slug || slug.length > 120) return null
  const col = await learnPosts()
  return (await col.findOne({ slug, status: 'published' }, { projection: { _id: 0 } })) as LearnPostDoc | null
}

/** Same series first, then same category, then shared tags. */
export async function relatedPosts(post: LearnPostDoc, limit = 4): Promise<LearnPostCard[]> {
  const col = await learnPosts()
  const base = { status: 'published' as const, slug: { $ne: post.slug } }
  const out: LearnPostCard[] = []
  const seen = new Set<string>()
  const add = (rows: LearnPostCard[]) => { for (const r of rows) if (!seen.has(r.slug) && out.length < limit) { seen.add(r.slug); out.push(r) } }
  if (post.series) add((await col.find({ ...base, series: post.series }, { projection: CARD_PROJECTION }).sort({ series_order: 1 }).limit(limit).toArray()) as LearnPostCard[])
  if (out.length < limit && post.tags.length) add((await col.find({ ...base, tags: { $in: post.tags } }, { projection: CARD_PROJECTION }).sort({ published_at: -1 }).limit(limit * 2).toArray()) as LearnPostCard[])
  if (out.length < limit) add((await col.find({ ...base, category: post.category }, { projection: CARD_PROJECTION }).sort({ published_at: -1 }).limit(limit).toArray()) as LearnPostCard[])
  return out
}

/** Series names with published posts (for the filter). */
export async function publishedSeries(): Promise<string[]> {
  const col = await learnPosts()
  const names = await col.distinct('series', { status: 'published', series: { $type: 'string' } })
  return (names as string[]).filter(Boolean).sort()
}

/** Latest published posts for feeds and the sitemap. */
export async function latestPublished(limit = 50): Promise<Array<Pick<LearnPostDoc, 'slug' | 'title' | 'summary' | 'category' | 'tags' | 'published_at' | 'updated_at'>>> {
  const col = await learnPosts()
  return col.find({ status: 'published' }, { projection: { _id: 0, slug: 1, title: 1, summary: 1, category: 1, tags: 1, published_at: 1, updated_at: 1 } })
    .sort({ published_at: -1 }).limit(limit).toArray()
}
