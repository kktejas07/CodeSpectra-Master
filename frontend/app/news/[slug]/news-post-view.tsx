/**
 * /news/[slug] — one tech news item (NewsArticle JSON-LD, sources, related items).
 * Every language (English: ./page.tsx, hi / te: app/[lang]/news/[slug]). SEO-047:
 * the chrome follows the page language; the article stays English, so /hi and
 * /te canonicalise to the English URL.
 */
import type { Metadata } from 'next'
import { cache } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import DOMPurify from 'isomorphic-dompurify'
import { ChevronRight, Clock, ExternalLink } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { NotifyBox } from '@/components/events-feed/notify-box'
import { JsonLd } from '@/components/seo/json-ld'
import { coverForPost } from '@/lib/blog-covers'
import { newsTopicLabel } from '@/lib/signals/feeds'
import { newsTopicOf } from '@/lib/signals/news'
import { newsListCached, newsPostCached } from '@/lib/cache/public-data'
import { buildMetadata, ogImagePath } from '@/lib/seo/metadata'
import { articleJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { getSiteOrigin } from '@/lib/seo/settings'
import type { Locale } from '@/lib/i18n/config'
import { formatDate } from '@/lib/i18n/format'
import { localizedPath } from '@/lib/i18n/public-paths'
import { publicT } from '@/lib/i18n/public-server'

const loadPost = cache((slug: string) => newsPostCached(slug))

export async function newsPostMetadata(slug: string, locale: Locale): Promise<Metadata> {
  const post = await loadPost(slug)
  if (!post) return { title: publicT(locale)('hubs.dtNewsNotFound'), robots: { index: false, follow: true } }
  return buildMetadata({
    title: post.title, description: post.excerpt, path: `/news/${post.slug}`, locale, kind: 'article', type: 'article',
    image: post.cover_image || undefined, publishedTime: post.published_at, modifiedTime: post.updated_at,
    section: newsTopicLabel(newsTopicOf(post.tags)), tags: post.tags.filter((t) => !t.startsWith('news:')),
  })
}

const fmt = (locale: Locale, iso?: string | null) => (!iso ? '' : locale === 'en'
  ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  : formatDate(locale, iso, { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }))
const plainText = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

export async function NewsPostView({ slug, locale }: { slug: string; locale: Locale }) {
  const t = publicT(locale)
  const lp = (p: string) => localizedPath(p, locale)
  const post = await loadPost(slug)
  if (!post) notFound()
  const topic = newsTopicOf(post.tags)
  const topicName = t.dyn(`hubs.newsTopic:${topic}`, newsTopicLabel(topic))
  const [site, related] = await Promise.all([
    getSiteOrigin(),
    newsListCached(topic, 1).then((r) => r.items.filter((n) => n.slug !== post.slug).slice(0, 4)).catch(() => []),
  ])
  const path = `/news/${post.slug}`
  const body = DOMPurify.sanitize(post.body || '')
  const cover = coverForPost({ title: post.title, category: post.category, cover_image: post.cover_image })
  const jsonLd = [
    articleJsonLd({
      site, type: 'NewsArticle', path, headline: post.title, description: post.excerpt,
      datePublished: post.published_at || post.created_at, dateModified: post.updated_at,
      image: post.cover_image || ogImagePath({ title: post.title.slice(0, 100), kind: 'article' }),
      section: newsTopicLabel(topic), keywords: post.tags.filter((t) => !t.startsWith('news:') && t !== 'signals'),
      citations: post.source_urls?.length ? post.source_urls : undefined,
      wordCount: plainText(post.body || '').split(' ').filter(Boolean).length,
      speakable: ['.speakable-summary'],
    }),
    breadcrumbJsonLd([{ name: t('marketing.crumbHome'), path: lp('/') }, { name: t('hubs.dtNewsCrumb'), path: lp('/news') }, { name: topicName, path: `${lp('/news')}?topic=${topic}` }, { name: post.title, path: lp(path) }], site),
  ]
  return (
    <PublicPageWrapper>
      <JsonLd data={jsonLd} />
      <div className="mx-auto grid w-full min-w-0 max-w-[1100px] gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8">
        <article className="min-w-0">
          <nav aria-label={t('hubs.dtBreadcrumb')} className="mb-6 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            <Link href={lp('/news')} className="hover:text-foreground">{t('hubs.dtNewsCrumb')}</Link>
            <ChevronRight className="h-3 w-3" aria-hidden />
            <Link href={`${lp('/news')}?topic=${topic}`} className="hover:text-foreground">{topicName}</Link>
          </nav>
          <h1 className="max-w-[24ch] text-3xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">{post.title}</h1>
          {post.excerpt && <p className="speakable-summary mt-4 max-w-[60ch] text-lg leading-relaxed text-muted-foreground">{post.excerpt}</p>}
          <p className="mt-4 flex flex-wrap items-center gap-2 border-b border-border pb-5 text-sm text-muted-foreground">
            <time dateTime={post.published_at || undefined}>{fmt(locale, post.published_at)}</time>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden /><span className="tabular-nums">{t('hubs.dtMinRead', { n: post.read_minutes })}</span></span>
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt="" width={1200} height={514} fetchPriority="high" decoding="async" referrerPolicy="no-referrer" className="mt-6 aspect-[21/9] w-full rounded-3xl border border-border/70 object-cover" />
          <div className="prose prose-zinc mt-8 max-w-[72ch] dark:prose-invert prose-headings:tracking-tight prose-a:text-primary prose-img:rounded-2xl" dangerouslySetInnerHTML={{ __html: body }} />
          {(post.source_urls?.length || post.source_note) ? (
            <section aria-labelledby="news-sources" className="mt-10 max-w-[72ch] rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
              <h2 id="news-sources" className="mb-2 font-semibold text-foreground">{t('hubs.dtSources')}</h2>
              {post.source_note && <p className="mb-2">{post.source_note}</p>}
              <ul className="space-y-1">
                {(post.source_urls || []).map((u) => (
                  <li key={u}><a href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-primary underline">{u.replace(/^https?:\/\//, '')}<ExternalLink className="h-3 w-3 shrink-0" aria-hidden /></a></li>
                ))}
              </ul>
            </section>
          ) : null}
          <p className="mt-10"><Link href={lp('/news')} className="text-sm font-semibold text-primary hover:underline">{t('hubs.dtAllNews')}</Link></p>
        </article>
        <aside className="space-y-6">
          <NotifyBox topic="news" compact />
          {related.length > 0 && (
            <div>
              <h2 className="mb-3 text-base font-semibold text-foreground">{t('hubs.dtMoreNews', { topic: locale === 'en' ? newsTopicLabel(topic).toLowerCase() : topicName })}</h2>
              <ul className="space-y-3">
                {related.map((r) => (
                  <li key={r.slug}><Link href={lp(`/news/${r.slug}`)} className="block rounded-2xl border border-border bg-card p-3 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary">{r.title}</Link></li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </PublicPageWrapper>
  )
}
