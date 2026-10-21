/**
 * /learn/[slug] — one published Learn post: sanitised markdown (no raw HTML),
 * syntax highlighting, table of contents, copy-code, share bar, practice CTA,
 * related posts, sources. SEO: metadata + Open Graph (dynamic image in
 * opengraph-image.tsx) + JSON-LD Article.
 *
 * The slug resolves to a Learn post first, then a "From the team" post
 * (blog_posts) — lib/learn/team-posts.ts decideLearnSlug.
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { ChevronRight, Clock, ExternalLink } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { LearnMarkdown } from '@/components/learn/learn-markdown'
import { ShareBar } from '@/components/learn/share-bar'
import { LearnPostCardView, LevelPill } from '@/components/learn/post-card'
import { learnPostCached, learnRelatedCached, learnSlugCached, teamRelatedCached } from '@/lib/cache/public-data'
import { extractToc } from '@/lib/learn/markdown'
import { postUrl } from '@/lib/learn/share'
import { categoryLabel } from '@/lib/learn/types'
import { buildMetadata } from '@/lib/seo/metadata'
import { articleJsonLd, breadcrumbJsonLd, faqJsonLd } from '@/lib/seo/jsonld'
import { extractFaqs, extractKeyTakeaways, wordCount } from '@/lib/seo/learn-extract'
import { getSiteOrigin } from '@/lib/seo/settings'
import { JsonLd } from '@/components/seo/json-ld'
import { AnswerSummary, SPEAKABLE_SELECTORS } from '@/components/seo/answer-summary'
import { formatDate } from '@/lib/format-datetime'
import { TeamArticle } from '@/components/learn/team-article'
import { teamCategoryLabel } from '@/lib/learn/team-posts'

// Rendered per request (never at build: no DB there). Found items come from
// the data cache (15 min, purged on publish); unknown slugs are not cached
// (hit-only loaders), so random URLs can't fill the cache. DB errors throw
// to the error boundary instead of caching a 404.
export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const post = await learnPostCached(slug).catch(() => null)
  if (!post) {
    const team = await learnSlugCached(slug).catch(() => null)
    const t = team?.post
    if (!t) return { title: 'Post not found', robots: { index: false, follow: true } }
    return buildMetadata({
      title: t.title,
      description: t.excerpt,
      path: `/learn/${encodeURIComponent(slug)}`,
      kind: 'article',
      type: 'article',
      image: t.cover_image || undefined,
      publishedTime: t.published_at,
      modifiedTime: t.updated_at,
      section: teamCategoryLabel(t.category),
      tags: t.tags,
    })
  }
  const path = `/learn/${encodeURIComponent(post.slug)}`
  return buildMetadata({
    title: post.title,
    description: post.summary,
    path,
    kind: 'article',
    type: 'article',
    image: `${path}/opengraph-image`,
    publishedTime: post.published_at,
    modifiedTime: post.updated_at,
    section: categoryLabel(post.category),
    tags: post.tags,
    keywords: post.tags,
  })
}

function safeDate(iso?: string | null): string {
  if (!iso) return ''
  try {
    return formatDate(iso, undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export default async function LearnPostPage({ params }: { params: Params }) {
  const { slug } = await params
  const post = await learnPostCached(slug)
  if (!post) {
    const resolved = await learnSlugCached(slug)
    if (!resolved) notFound()
    const { decision, post: team } = resolved
    if (decision.kind === 'redirect') permanentRedirect(decision.to)
    if (decision.kind !== 'team' || !team) notFound()
    const [relatedT, site] = await Promise.all([teamRelatedCached(slug).catch(() => []), getSiteOrigin()])
    return <TeamArticle post={team} path={`/learn/${encodeURIComponent(slug)}`} related={relatedT} site={site} />
  }
  const related = await learnRelatedCached(post.slug).catch(() => [])
  const toc = extractToc(post.body).filter((t) => t.level === 2)
  const origin = await getSiteOrigin()
  const url = postUrl(origin, post.slug)
  const path = `/learn/${encodeURIComponent(post.slug)}`
  const faqs = extractFaqs(post.body)
  const takeaways = extractKeyTakeaways(post.body)
  const autoPublished = post.reviewed_by === 'auto-approve'

  const jsonLd = [
    articleJsonLd({
      site: origin,
      type: 'TechArticle',
      path,
      headline: post.title,
      description: post.summary,
      datePublished: post.published_at,
      dateModified: post.updated_at,
      image: `${path}/opengraph-image`,
      section: categoryLabel(post.category),
      keywords: post.tags,
      citations: post.sources.map((s) => s.url),
      proficiencyLevel: post.level === 'beginner' ? 'Beginner' : 'Expert',
      wordCount: wordCount(post.body),
      speakable: SPEAKABLE_SELECTORS,
    }),
    breadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Learn', path: '/learn' },
      { name: categoryLabel(post.category), path: `/learn?category=${post.category}` },
      { name: post.title, path },
    ], origin),
    faqJsonLd(faqs),
  ]

  return (
    <PublicPageWrapper>
      <JsonLd data={jsonLd} />
      <div className="mx-auto w-full min-w-0 max-w-[1200px] px-4 pb-20 pt-28 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <Link href="/learn" className="hover:text-foreground">Learn</Link>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <Link href={`/learn?category=${post.category}`} className="hover:text-foreground">{categoryLabel(post.category)}</Link>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <span className="line-clamp-1 max-w-56 text-foreground sm:max-w-xs" aria-current="page">{post.title}</span>
        </nav>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <article className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-primary">{categoryLabel(post.category)}</span>
              <LevelPill level={post.level} />
              {post.series ? (
                <Link href={`/learn?series=${encodeURIComponent(post.series)}`} className="text-muted-foreground hover:text-foreground">
                  Series: {post.series}{post.series_order ? ` · part ${post.series_order}` : ''}
                </Link>
              ) : null}
            </div>
            <h1 className="mt-3 max-w-[24ch] text-4xl font-bold tracking-tight text-foreground sm:text-5xl">{post.title}</h1>
            <p className="mt-4 max-w-[65ch] text-lg leading-relaxed text-muted-foreground">{post.summary}</p>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-6 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden /><span className="tabular-nums">{post.reading_minutes}</span> min read</span>
              {post.published_at ? <time dateTime={post.published_at}>{safeDate(post.published_at)}</time> : null}
            </div>
            <ShareBar slug={post.slug} url={url} title={post.title} summary={post.summary} className="mt-5" countView />

            {/* Answer-first summary for snippets, AI answers and voice (speakable). */}
            <AnswerSummary className="mt-8 max-w-[72ch]" label="Key takeaways" answer={post.summary} points={takeaways} />

            <LearnMarkdown content={post.body} className="mt-8 max-w-[72ch]" />

            {post.tags.length > 0 && (
              <ul className="mt-10 flex flex-wrap gap-2" aria-label="Tags">
                {post.tags.map((t) => (
                  <li key={t}>
                    <Link href={`/learn?tag=${encodeURIComponent(t)}`} className="inline-flex min-h-8 items-center rounded-full border border-border px-3 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary">#{t}</Link>
                  </li>
                ))}
              </ul>
            )}

            <section className="mt-10 max-w-[72ch] rounded-3xl border border-border bg-muted/30 p-5 text-sm text-muted-foreground">
              <h2 className="font-semibold text-foreground">About this post and its sources</h2>
              <p className="mt-1">
                {autoPublished
                  ? 'Written by the CodeSpectra learning bot in its own words and published after automated quality checks; our editors review it afterwards.'
                  : 'Written by the CodeSpectra learning bot in its own words and reviewed by our team before publishing.'}
                {post.sources.length ? ' The pages it learned from are cited below.' : ''}{' '}
                <Link href="/editorial-policy" className="text-primary hover:underline">Editorial policy</Link>
                {post.updated_at ? <> · Last updated <time dateTime={post.updated_at}>{safeDate(post.updated_at)}</time></> : null}
              </p>
              {post.sources.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {post.sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 break-all text-primary hover:underline">
                        {s.title}<ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="mt-8 max-w-[72ch]">
              <p className="mb-3 text-sm font-semibold text-foreground">Found this useful? Share it</p>
              <ShareBar slug={post.slug} url={url} title={post.title} summary={post.summary} />
            </div>
          </article>

          <aside className="space-y-6">
            {toc.length > 0 && (
              <nav aria-label="On this page" className="hidden lg:sticky lg:top-28 lg:block">
                <p className="text-sm font-semibold text-foreground">On this page</p>
                <ul className="mt-3 space-y-2 border-l border-border pl-3">
                  {toc.map((t) => (
                    <li key={t.id}><a href={`#${t.id}`} className="text-sm text-muted-foreground hover:text-primary">{t.text}</a></li>
                  ))}
                </ul>
              </nav>
            )}
            <div className="rounded-3xl border border-border bg-card p-5">
              <h2 className="text-base font-semibold text-foreground">Practise it</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {post.practice.length ? 'Solve related problems with instant feedback on your code.' : 'Turn what you just read into working code.'}
              </p>
              {post.practice.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {post.practice.map((p) => (
                    <li key={p.slug}>
                      <Link href={`/dashboard/problems/${encodeURIComponent(p.slug)}`} className="text-sm font-medium text-primary hover:underline">{p.title}</Link>
                      {p.difficulty ? <span className="ml-2 text-xs capitalize text-muted-foreground">{p.difficulty}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/dashboard/problems" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-[filter] hover:brightness-110">
                Start practising
              </Link>
            </div>
          </aside>
        </div>

        {related.length > 0 && (
          <section className="mt-16" aria-labelledby="related-heading">
            <h2 id="related-heading" className="text-2xl font-bold tracking-tight text-foreground">Keep learning</h2>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {related.map((r) => <LearnPostCardView key={r.slug} post={r} />)}
            </div>
          </section>
        )}
      </div>
    </PublicPageWrapper>
  )
}
