/**
 * "From the team" posts in the Learn hub. The team still writes posts in the
 * admin blog editor (collection `blog_posts`); they are published under
 * /learn alongside the Learn bot's explainers. Tech news (tag or category
 * 'signals') keeps its own section at /news.
 *
 * URL rules (pure, client-safe, tested in tests/learn-team-posts.test.ts):
 *   - a team post lives at /learn/<slug>, unless a published Learn post already
 *     owns that slug: then it lives at /learn/team-<slug> (Learn posts win);
 *   - /blog → /learn (search kept), /blog?category=x → /learn?source=team&category=x,
 *     /blog?category=signals → /news;
 *   - /blog/<slug> → /news/<slug> for news, else the team post's /learn path.
 */
import { BLOG_CATEGORIES } from '@/lib/blog-categories'

export const TEAM_SOURCE = 'team'
export const TEAM_LABEL = 'From the team'
export const TEAM_SLUG_PREFIX = 'team-'
const NEWS_ID = 'signals'

/** Blog categories offered as Learn filters under "From the team" (news excluded). */
export const TEAM_CATEGORIES = BLOG_CATEGORIES.filter((c) => c.id !== NEWS_ID)
export type TeamCategoryId = (typeof TEAM_CATEGORIES)[number]['id']

export function isTeamCategory(v: unknown): v is TeamCategoryId {
  return typeof v === 'string' && TEAM_CATEGORIES.some((c) => c.id === v)
}

export function teamCategoryLabel(id: string): string {
  return TEAM_CATEGORIES.find((c) => c.id === id)?.label ?? id
}

/** True for a blog post that belongs to /news instead of /learn. */
export function isNewsPost(p: { tags?: readonly string[] | null; category?: string | null }): boolean {
  return p.category === NEWS_ID || !!p.tags?.includes(NEWS_ID)
}

/** Mongo filter for team posts shown in Learn (published, not news). */
export function teamBaseFilter(): Record<string, unknown> {
  return { status: 'published', tags: { $ne: NEWS_ID }, category: { $ne: NEWS_ID } }
}

/** The /learn slug of a team post. `collides`: a published Learn post has this slug. */
export function teamLearnSlug(blogSlug: string, collides: boolean): string {
  return collides ? `${TEAM_SLUG_PREFIX}${blogSlug}` : blogSlug
}

export function teamLearnPath(blogSlug: string, collides: boolean): string {
  return `/learn/${encodeURIComponent(teamLearnSlug(blogSlug, collides))}`
}

/** The base blog slug a prefixed /learn slug could stand for, or null. */
export function prefixedBase(slug: string): string | null {
  return slug.startsWith(TEAM_SLUG_PREFIX) && slug.length > TEAM_SLUG_PREFIX.length ? slug.slice(TEAM_SLUG_PREFIX.length) : null
}

export interface SlugFacts {
  slug: string
  /** A published Learn post has `slug`. */
  learn: boolean
  /** The published blog post with `slug` (null: none). */
  blog: { news: boolean } | null
  /** For a `team-` slug: the published blog post with the base slug. */
  baseBlog?: { news: boolean } | null
  /** For a `team-` slug: a published Learn post has the base slug. */
  baseLearn?: boolean
}

export type SlugDecision =
  | { kind: 'learn' }
  | { kind: 'team'; blogSlug: string }
  | { kind: 'redirect'; to: string }
  | { kind: 'not_found' }

/**
 * What /learn/<slug> shows. Learn posts first, then team posts by their own
 * slug, then a `team-<base>` slug for a team post whose slug a Learn post took.
 * A news post redirects to /news; a prefixed URL whose base is free redirects
 * to the plain one (so each team post has exactly one URL).
 */
export function decideLearnSlug(f: SlugFacts): SlugDecision {
  if (f.learn) return { kind: 'learn' }
  if (f.blog) return f.blog.news ? { kind: 'redirect', to: `/news/${encodeURIComponent(f.slug)}` } : { kind: 'team', blogSlug: f.slug }
  const base = prefixedBase(f.slug)
  if (base && f.baseBlog) {
    if (f.baseBlog.news) return { kind: 'redirect', to: `/news/${encodeURIComponent(base)}` }
    return f.baseLearn ? { kind: 'team', blogSlug: base } : { kind: 'redirect', to: `/learn/${encodeURIComponent(base)}` }
  }
  return { kind: 'not_found' }
}

type SP = URLSearchParams | Record<string, string | string[] | undefined>
function getParam(sp: SP, k: string): string {
  if (sp instanceof URLSearchParams) return (sp.get(k) || '').trim()
  const v = sp[k]
  return ((Array.isArray(v) ? v[0] : v) || '').trim()
}

/** Where /blog?… now lives. */
export function blogIndexRedirect(sp: SP): string {
  const category = getParam(sp, 'category')
  const q = getParam(sp, 'q').slice(0, 80)
  if (category === NEWS_ID) return '/news'
  const out = new URLSearchParams()
  if (isTeamCategory(category)) {
    out.set('source', TEAM_SOURCE)
    out.set('category', category)
  }
  if (q) out.set('q', q)
  const s = out.toString()
  return s ? `/learn?${s}` : '/learn'
}

/** Where /blog/<slug> now lives. `post`: the published blog post (null: none). */
export function blogPostRedirect(slug: string, post: { news: boolean } | null, collides: boolean): string {
  if (post?.news) return `/news/${encodeURIComponent(slug)}`
  if (!post) return `/learn/${encodeURIComponent(slug)}`
  return teamLearnPath(slug, collides)
}

/** Which collections a Learn listing reads, from its filters. */
export function hubSources(p: { source?: string | null; category?: string | null; level?: string | null; series?: string | null }, isLearnCategory: (v: unknown) => boolean): { learn: boolean; team: boolean } {
  if (p.source === TEAM_SOURCE) return { learn: false, team: true }
  // Level, series and Learn categories only exist on Learn posts.
  if (p.level || p.series || isLearnCategory(p.category)) return { learn: true, team: false }
  return { learn: true, team: true }
}

/**
 * One page of two newest-first lists merged by published_at. Each list must
 * hold at least the first page*limit items of its source.
 */
export function mergePage<T extends { published_at?: string | null }>(a: T[], b: T[], page: number, limit: number): T[] {
  const all = [...a, ...b].sort((x, y) => String(y.published_at || '').localeCompare(String(x.published_at || '')))
  return all.slice((page - 1) * limit, page * limit)
}
