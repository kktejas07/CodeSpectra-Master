/**
 * /news — public tech news (Signals): topic filter, pagination, RSS, an
 * ItemList of NewsArticle JSON-LD, and the daily digest sign-up. Separate from
 * /blog (product newsroom). Server-rendered from published items only.
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { Clock, Newspaper, Rss } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { PageHero } from '@/components/landing/page-hero'
import { EmptyState } from '@/components/ui/empty-state'
import { NotifyBox } from '@/components/events-feed/notify-box'
import { JsonLd } from '@/components/seo/json-ld'
import { NEWS_TOPICS, newsTopicLabel } from '@/lib/signals/feeds'
import { listNews, parseNewsParams, type NewsCard } from '@/lib/signals/news'
import { buildMetadata } from '@/lib/seo/metadata'
import { breadcrumbJsonLd, compact } from '@/lib/seo/jsonld'
import { getSiteOrigin } from '@/lib/seo/settings'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type SP = Promise<Record<string, string | string[] | undefined>>

/** Hub + one indexable page per topic (self-canonical); deeper pages are noindex,follow. */
export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const p = parseNewsParams(await searchParams)
  const base = buildMetadata({
    title: p.topic ? `${newsTopicLabel(p.topic)} news for developers` : 'Tech news for developers and students',
    description: p.topic
      ? `The latest ${newsTopicLabel(p.topic).toLowerCase()} news for builders, summarised from primary sources by CodeSpectra.`
      : 'Daily tech news for builders: cloud releases, security advisories, language releases, AI and India tech careers, summarised from primary sources.',
    path: '/news',
    canonical: p.topic ? `/news?topic=${p.topic}` : '/news',
    noIndex: p.page > 1 ? 'follow' : false,
  })
  return { ...base, alternates: { ...base.alternates, types: { 'application/rss+xml': '/news/rss.xml' } } }
}

function href(topic: string | null, page = 1): string {
  const sp = new URLSearchParams()
  if (topic) sp.set('topic', topic)
  if (page > 1) sp.set('page', String(page))
  const s = sp.toString()
  return s ? `/news?${s}` : '/news'
}

function Chip({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={to} aria-current={active ? 'true' : undefined}
      className={cn('inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:border-primary/40 hover:text-primary')}>
      {children}
    </Link>
  )
}

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '')

function NewsItem({ n }: { n: NewsCard }) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-14px_rgba(15,23,41,0.10)] transition-[transform,border-color] duration-300 hover:-translate-y-0.5 hover:border-primary/40 motion-reduce:hover:translate-y-0 dark:shadow-none">
      {n.cover_image && (
        <div className="h-36 w-full overflow-hidden bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={n.cover_image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-5">
        <p className="text-xs font-semibold text-primary">{newsTopicLabel(n.topic)}</p>
        <h2 className="text-base font-semibold leading-snug text-foreground">
          <Link href={`/news/${n.slug}`} className="rounded hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{n.title}</Link>
        </h2>
        <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{n.excerpt}</p>
        <p className="mt-auto flex items-center gap-2 pt-2 text-xs text-muted-foreground">
          <time dateTime={n.published_at || undefined}>{fmt(n.published_at)}</time>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden /><span className="tabular-nums">{n.read_minutes}</span> min read</span>
        </p>
      </div>
    </article>
  )
}

export default async function NewsPage({ searchParams }: { searchParams: SP }) {
  const p = parseNewsParams(await searchParams)
  const [list, site] = await Promise.all([
    listNews({ topic: p.topic, page: p.page }).catch(() => ({ items: [] as NewsCard[], total: 0, page: p.page, pages: 1 })),
    getSiteOrigin(),
  ])
  const jsonLd = [
    compact({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: p.topic ? `${newsTopicLabel(p.topic)} news` : 'CodeSpectra tech news',
      itemListElement: list.items.map((n, i) => ({
        '@type': 'ListItem', position: (list.page - 1) * 12 + i + 1,
        item: compact({ '@type': 'NewsArticle', headline: n.title.slice(0, 110), url: `${site}/news/${n.slug}`, datePublished: n.published_at || undefined, image: n.cover_image ? [n.cover_image.startsWith('http') ? n.cover_image : `${site}${n.cover_image}`] : undefined }),
      })),
    }),
    breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'News', path: '/news' }], site),
  ]
  return (
    <PublicPageWrapper>
      <JsonLd data={jsonLd} />
      <PageHero
        title="Tech news"
        lead="What changed this week in cloud, security, languages, AI and India tech careers — summarised for builders from the original announcements, with links to every source."
        actions={<Link href="/news/rss.xml" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground hover:border-primary/40 hover:text-primary"><Rss className="h-4 w-4" aria-hidden /> RSS feed</Link>}
      />
      <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_340px] lg:px-8">
        <div className="min-w-0 space-y-6">
          <nav aria-label="Filter by topic" className="flex flex-wrap gap-2">
            <Chip to={href(null)} active={!p.topic}>All news</Chip>
            {NEWS_TOPICS.map((t) => <Chip key={t.id} to={href(t.id)} active={p.topic === t.id}>{t.label}</Chip>)}
          </nav>
          {list.items.length === 0 ? (
            <EmptyState illustration="search" title={p.topic ? 'No news on this topic yet' : 'No news yet'}
              description="New items appear here as soon as they’re published. Subscribe to the daily digest to get them first."
              actionLabel={p.topic ? 'See all news' : undefined} actionHref={p.topic ? '/news' : undefined} />
          ) : (
            <div className="cs-stagger grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {list.items.map((n) => <NewsItem key={n.slug} n={n} />)}
            </div>
          )}
          {list.pages > 1 && (
            <nav aria-label="Pagination" className="flex items-center justify-between gap-3 pt-2 text-sm">
              {list.page > 1 ? <Link href={href(p.topic, list.page - 1)} rel="prev" className="rounded-xl border border-border px-4 py-2 hover:border-primary/40 hover:text-primary">Newer</Link> : <span />}
              <span className="text-muted-foreground tabular-nums">Page {list.page} of {list.pages}</span>
              {list.page < list.pages ? <Link href={href(p.topic, list.page + 1)} rel="next" className="rounded-xl border border-border px-4 py-2 hover:border-primary/40 hover:text-primary">Older</Link> : <span />}
            </nav>
          )}
        </div>
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <NotifyBox topic="news" />
          <p className="flex items-start gap-2 px-2 text-xs leading-relaxed text-muted-foreground">
            <Newspaper className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Summaries are written by CodeSpectra from public feeds and checked against their sources. Product updates live on the <Link href="/blog" className="text-primary hover:underline">blog</Link>.
          </p>
        </aside>
      </div>
    </PublicPageWrapper>
  )
}
