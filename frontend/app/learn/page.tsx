/**
 * /learn — public Learn hub: search, filters (category, level, tag, series),
 * pagination. Server-rendered from published posts only. Also holds the
 * team's posts (blog_posts, "From the team", ?source=team&category=<blog
 * category>); news stays at /news. See lib/learn/team-posts.ts.
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { Search, Rss } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { EmptyState } from '@/components/ui/empty-state'
import { HubCardView } from '@/components/learn/post-card'
import { LearnCategoryIcon } from '@/components/learn/category-icon'
import { NotifyBox } from '@/components/events-feed/notify-box'
import { parseListParams, publishedSeries } from '@/lib/learn/queries'
import { listHub } from '@/lib/learn/team-queries'
import { TEAM_CATEGORIES, TEAM_LABEL, TEAM_SOURCE, isTeamCategory, teamCategoryLabel } from '@/lib/learn/team-posts'
import { LEARN_CATEGORIES, LEARN_LEVELS, categoryLabel } from '@/lib/learn/types'
import { cn } from '@/lib/utils'
import { buildMetadata } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'

type SP = Promise<Record<string, string | string[] | undefined>>

/**
 * Hub + one indexable page per category (?category=x, self-canonical). Search,
 * tag, level, series and page variants are noindex,follow so crawlers follow
 * the posts without indexing endless filter combinations.
 */
export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const p = parseListParams(await searchParams)
  const team = p.source === TEAM_SOURCE
  const cat = !team && p.category && LEARN_CATEGORIES.some((c) => c.id === p.category) ? p.category : null
  const teamCat = team && isTeamCategory(p.category) ? p.category : null
  const other = !!(p.q || p.tag || p.level || p.series || (p.page && p.page > 1))
  const base = team
    ? buildMetadata({
        title: teamCat ? `${TEAM_LABEL}: ${teamCategoryLabel(teamCat)}` : `${TEAM_LABEL}: product, engineering and campus`,
        description: 'Product updates, engineering notes, career advice and campus stories from the CodeSpectra team.',
        path: '/learn',
        canonical: teamCat ? `/learn?source=${TEAM_SOURCE}&category=${encodeURIComponent(teamCat)}` : `/learn?source=${TEAM_SOURCE}`,
        noIndex: other ? 'follow' : false,
      })
    : cat
    ? buildMetadata({
        title: `${categoryLabel(cat)} explainers and tutorials`,
        description: `Free, original ${categoryLabel(cat).toLowerCase()} explainers from CodeSpectra Learn, with runnable code, interview questions and practice problems.`,
        path: '/learn',
        canonical: `/learn?category=${encodeURIComponent(cat)}`,
        noIndex: other ? 'follow' : false,
      })
    : buildMetadata({
        title: 'Learn: algorithms, system design and engineering',
        description: 'Free, original explainers on algorithms, data structures, system design, design patterns, testing and security, with code in Python, JavaScript and Java.',
        path: '/learn',
        noIndex: other ? 'follow' : false,
      })
  return { ...base, alternates: { ...base.alternates, types: { 'application/rss+xml': '/learn/rss.xml' } } }
}

function hrefWith(base: Record<string, string | null | undefined>, patch: Record<string, string | null>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) sp.set(k, v)
  sp.delete('page')
  if (patch.page) sp.set('page', patch.page)
  const s = sp.toString()
  return s ? `/learn?${s}` : '/learn'
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:border-primary/40 hover:text-primary',
      )}
    >
      {children}
    </Link>
  )
}

export default async function LearnPage({ searchParams }: { searchParams: SP }) {
  const raw = await searchParams
  const params = parseListParams(raw)
  let data: Awaited<ReturnType<typeof listHub>> = { items: [], total: 0, page: 1, pages: 1 }
  let series: string[] = []
  try {
    ;[data, series] = await Promise.all([listHub(params), publishedSeries()])
  } catch (e) {
    console.error('[learn] page:', (e as Error)?.message)
  }
  const team = params.source === TEAM_SOURCE
  const cur = { q: params.q, category: params.category, level: params.level, tag: params.tag, series: params.series, source: team ? TEAM_SOURCE : null }
  const filtered = !!(params.q || params.category || params.level || params.tag || params.series || team)
  const catLabel = params.category ? (team ? teamCategoryLabel(params.category) : categoryLabel(params.category)) : ''

  return (
    <PublicPageWrapper>
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-20 pt-28 sm:px-6 lg:px-8">
        <header className="max-w-3xl">
          <p className="text-sm font-semibold text-primary">CodeSpectra Learn</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">Learn how software really works</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Clear explainers on algorithms, system design, patterns and engineering practices — with worked examples,
            code in several languages, interview questions and problems to practise. Plus product, engineering and campus
            notes from the CodeSpectra team.
          </p>
        </header>

        <form action="/learn" method="get" role="search" className="mt-8 flex max-w-xl gap-2">
          {team ? <input type="hidden" name="source" value={TEAM_SOURCE} /> : null}
          {params.category ? <input type="hidden" name="category" value={params.category} /> : null}
          {params.level ? <input type="hidden" name="level" value={params.level} /> : null}
          <label htmlFor="learn-q" className="sr-only">Search posts</label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              id="learn-q"
              name="q"
              defaultValue={params.q ?? ''}
              placeholder="Search topics, e.g. binary search"
              maxLength={80}
              className="h-11 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <button type="submit" className="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Search
          </button>
        </form>

        <nav aria-label="Filter by category" className="mt-6 flex flex-wrap gap-2">
          <Chip href={hrefWith(cur, { category: null, source: null })} active={!params.category && !team}>All topics</Chip>
          {LEARN_CATEGORIES.map((c) => (
            <Chip key={c.id} href={hrefWith(cur, { category: c.id, source: null })} active={!team && params.category === c.id}><LearnCategoryIcon id={c.id} className="mr-1.5 h-3.5 w-3.5" />{c.label}</Chip>
          ))}
          <Chip href={hrefWith(cur, { category: null, level: null, series: null, source: TEAM_SOURCE })} active={team}>{TEAM_LABEL}</Chip>
        </nav>
        {team ? (
          <nav aria-label={`Filter ${TEAM_LABEL.toLowerCase()} posts`} className="mt-3 flex flex-wrap items-center gap-2">
            <Chip href={hrefWith(cur, { category: null })} active={!params.category}>All team posts</Chip>
            {TEAM_CATEGORIES.map((c) => (
              <Chip key={c.id} href={hrefWith(cur, { category: c.id })} active={params.category === c.id}>{c.label}</Chip>
            ))}
          </nav>
        ) : null}
        {!team ? <>
        <nav aria-label="Filter by level" className="mt-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm text-muted-foreground">Level</span>
          <Chip href={hrefWith(cur, { level: null })} active={!params.level}>Any</Chip>
          {LEARN_LEVELS.map((l) => (
            <Chip key={l} href={hrefWith(cur, { level: l })} active={params.level === l}><span className="capitalize">{l}</span></Chip>
          ))}
        </nav>
        {series.length > 0 && (
          <nav aria-label="Series" className="mt-3 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm text-muted-foreground">Series</span>
            {series.map((s) => (
              <Chip key={s} href={hrefWith(cur, { series: params.series === s ? null : s })} active={params.series === s}>{s}</Chip>
            ))}
          </nav>
        )}
        </> : null}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            <span className="tabular-nums">{data.total}</span> {data.total === 1 ? 'post' : 'posts'}
            {team ? ` from the team` : ''}
            {catLabel ? ` in ${catLabel}` : ''}
            {params.tag ? ` tagged “${params.tag}”` : ''}
            {params.series ? ` in the “${params.series}” series` : ''}
          </p>
          <div className="flex items-center gap-4 text-sm">
            {filtered ? <Link href="/learn" className="font-medium text-primary hover:underline">Clear filters</Link> : null}
            <a href="/learn/rss.xml" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><Rss className="h-4 w-4" aria-hidden /> RSS</a>
          </div>
        </div>

        {data.items.length === 0 ? (
          <EmptyState
            className="mt-6"
            variant="search"
            title={filtered ? 'No posts match these filters' : 'New posts are on the way'}
            description={filtered ? 'Try a different word or clear the filters to see everything.' : 'Our first explainers are being reviewed. Check back soon, or practise problems in the meantime.'}
            actionLabel={filtered ? 'Clear filters' : 'Practise problems'}
            actionHref={filtered ? '/learn' : '/dashboard/problems'}
          />
        ) : (
          <div className="cs-stagger mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
            {data.items.map((p) => <HubCardView key={`${p.kind}:${p.slug}`} post={p} />)}
          </div>
        )}

        {data.pages > 1 && (
          <nav aria-label="Pages" className="mt-10 flex items-center justify-center gap-3 text-sm">
            {data.page > 1 ? <Link className="rounded-lg border border-border px-4 py-2 hover:border-primary/40" href={hrefWith(cur, { page: String(data.page - 1) })}>Previous</Link> : null}
            <span className="tabular-nums text-muted-foreground">Page {data.page} of {data.pages}</span>
            {data.page < data.pages ? <Link className="rounded-lg border border-border px-4 py-2 hover:border-primary/40" href={hrefWith(cur, { page: String(data.page + 1) })}>Next</Link> : null}
          </nav>
        )}

        <section aria-label="Subscribe to new posts" className="mx-auto mt-14 max-w-xl">
          <NotifyBox topic="blog" />
        </section>
      </div>
    </PublicPageWrapper>
  )
}
