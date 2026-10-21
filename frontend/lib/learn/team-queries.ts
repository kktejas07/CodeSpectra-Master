/**
 * Server queries for "From the team" posts (blog_posts) in the Learn hub.
 * URL rules live in ./team-posts (pure).
 */
import { sanitizeRegex } from '@/lib/sanitize'
import { blogPosts, type BlogPostDoc } from '@/lib/db/blog-posts'
import { ensureBlogSeed } from '@/lib/blog-seed'
import { learnPosts } from './store'
import { listPublished, listPublishedTop, type ListParams } from './queries'
import { isLearnCategory, type LearnPostCard } from './types'
import { decideLearnSlug, hubSources, isNewsPost, isTeamCategory, mergePage, prefixedBase, teamBaseFilter, teamLearnSlug, type SlugDecision } from './team-posts'

/** Team post as a Learn card. `slug` is the /learn slug (may carry the team- prefix). */
export interface TeamPostCard {
  kind: 'team'
  slug: string
  blog_slug: string
  title: string
  summary: string
  category: string
  tags: string[]
  reading_minutes: number
  published_at?: string | null
  updated_at?: string
  author_name?: string
  cover_image?: string
}

const TEAM_PROJECTION = { _id: 0, slug: 1, title: 1, excerpt: 1, category: 1, tags: 1, read_minutes: 1, published_at: 1, updated_at: 1, author_name: 1, cover_image: 1 } as const

/** Which of these slugs a published Learn post owns. */
export async function learnSlugsTaken(slugs: string[]): Promise<Set<string>> {
  if (!slugs.length) return new Set()
  const rows = await (await learnPosts()).find({ status: 'published', slug: { $in: slugs } }, { projection: { _id: 0, slug: 1 } }).toArray()
  return new Set(rows.map((r) => r.slug))
}

/** blog slug → its public path (/learn/…, or /news/… for news). */
export async function teamPublicPaths(posts: Pick<BlogPostDoc, 'slug' | 'tags' | 'category'>[]): Promise<Map<string, string>> {
  const taken = await learnSlugsTaken(posts.filter((p) => !isNewsPost(p)).map((p) => p.slug))
  return new Map(posts.map((p) => [p.slug, isNewsPost(p) ? `/news/${encodeURIComponent(p.slug)}` : `/learn/${encodeURIComponent(teamLearnSlug(p.slug, taken.has(p.slug)))}`]))
}

async function toCards(rows: Partial<BlogPostDoc>[]): Promise<TeamPostCard[]> {
  const taken = await learnSlugsTaken(rows.map((r) => String(r.slug)))
  return rows.map((r) => ({
    kind: 'team' as const,
    slug: teamLearnSlug(String(r.slug), taken.has(String(r.slug))),
    blog_slug: String(r.slug),
    title: r.title || '',
    summary: r.excerpt || '',
    category: r.category || '',
    tags: r.tags || [],
    reading_minutes: r.read_minutes || 1,
    published_at: r.published_at ?? null,
    updated_at: r.updated_at,
    author_name: r.author_name,
    cover_image: r.cover_image,
  }))
}

export function teamFilter(p: { q?: string | null; category?: string | null; tag?: string | null }): Record<string, unknown> {
  const filter: Record<string, unknown> = teamBaseFilter()
  if (isTeamCategory(p.category)) filter.category = p.category
  const tag = typeof p.tag === 'string' ? p.tag.trim().toLowerCase().slice(0, 40) : ''
  if (tag) filter.tags = { $eq: tag, $ne: 'signals' }
  const q = typeof p.q === 'string' ? p.q.trim().slice(0, 80) : ''
  if (q) {
    const re = new RegExp(sanitizeRegex(q), 'i')
    filter.$or = [{ title: re }, { excerpt: re }, { tags: re }]
  }
  return filter
}

/** Newest team posts matching the filter (first `take`), with the total. */
export async function listTeam(p: { q?: string | null; category?: string | null; tag?: string | null }, take: number): Promise<{ items: TeamPostCard[]; total: number }> {
  await ensureBlogSeed().catch(() => {})
  const col = await blogPosts()
  const filter = teamFilter(p)
  const [rows, total] = await Promise.all([
    col.find(filter, { projection: TEAM_PROJECTION }).sort({ published_at: -1, created_at: -1 }).limit(Math.max(1, take)).toArray(),
    col.countDocuments(filter),
  ])
  return { items: await toCards(rows), total }
}

/** Latest team posts for feeds and the sitemap (Learn paths resolved). */
export async function latestTeam(limit = 50): Promise<TeamPostCard[]> {
  const rows = await (await blogPosts()).find(teamBaseFilter(), { projection: TEAM_PROJECTION }).sort({ published_at: -1 }).limit(limit).toArray()
  return toCards(rows)
}

async function blogFact(slug: string): Promise<BlogPostDoc | null> {
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(slug)) return null
  return (await blogPosts()).findOne({ slug, status: 'published' }, { projection: { _id: 0 } }) as Promise<BlogPostDoc | null>
}

/** Resolve /learn/<slug> (Learn post first, then team post). */
export async function resolveLearnSlug(slug: string, learnExists: boolean): Promise<{ decision: SlugDecision; post: BlogPostDoc | null }> {
  if (learnExists) return { decision: { kind: 'learn' }, post: null }
  await ensureBlogSeed().catch(() => {})
  const blog = await blogFact(slug)
  const base = blog ? null : prefixedBase(slug)
  const baseBlog = base ? await blogFact(base) : null
  const baseLearn = base && baseBlog ? (await learnSlugsTaken([base])).has(base) : false
  const decision = decideLearnSlug({
    slug,
    learn: false,
    blog: blog ? { news: isNewsPost(blog) } : null,
    baseBlog: baseBlog ? { news: isNewsPost(baseBlog) } : null,
    baseLearn,
  })
  return { decision, post: decision.kind === 'team' ? (blog ?? baseBlog) : null }
}

/** Facts for /blog/<slug>: the published post (null: none) and whether a Learn post owns the slug. */
export async function blogRedirectFacts(slug: string): Promise<{ post: { news: boolean } | null; collides: boolean }> {
  const post = await blogFact(slug).catch(() => null)
  if (!post) return { post: null, collides: false }
  const news = isNewsPost(post)
  return { post: { news }, collides: news ? false : (await learnSlugsTaken([slug])).has(slug) }
}

/** Related team posts (same category). */
export async function relatedTeam(post: BlogPostDoc, limit = 4): Promise<TeamPostCard[]> {
  const rows = await (await blogPosts()).find({ ...teamBaseFilter(), category: post.category, slug: { $ne: post.slug } }, { projection: TEAM_PROJECTION }).sort({ published_at: -1 }).limit(limit).toArray()
  return toCards(rows)
}

export type HubCard = ({ kind: 'learn' } & LearnPostCard) | TeamPostCard

/**
 * The /learn listing: Learn posts and team posts merged newest first.
 * Learn-only filters (category, level, series) read Learn posts only;
 * ?source=team reads team posts only. Series keep their own order.
 */
export async function listHub(p: ListParams): Promise<{ items: HubCard[]; total: number; page: number; pages: number }> {
  const src = hubSources(p, isLearnCategory)
  const limit = Math.max(1, Math.min(48, Math.floor(p.limit ?? 12)))
  // ponytail: merged paging reads the first page*limit of each source; capped at page 100.
  const page = Math.max(1, Math.min(src.learn && src.team ? 100 : 500, Math.floor(p.page ?? 1)))
  if (!src.team) {
    const r = await listPublished({ ...p, page, limit })
    return { ...r, items: r.items.map((i) => ({ kind: 'learn' as const, ...i })) }
  }
  const take = page * limit
  const [learn, team] = await Promise.all([
    src.learn ? listPublishedTop(p, take) : Promise.resolve({ items: [], total: 0 }),
    listTeam(p, take),
  ])
  const learnCards: HubCard[] = learn.items.map((i) => ({ kind: 'learn' as const, ...i }))
  const total = learn.total + team.total
  return { items: mergePage<HubCard>(learnCards, team.items, page, limit), total, page, pages: Math.max(1, Math.ceil(total / limit)) }
}
