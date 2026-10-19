import type { Metadata } from 'next'
import { buildMetadata } from '@/lib/seo/metadata'
import { publicRoute } from '@/lib/seo/public-routes'
import { formatDate as tzFormatDate } from '@/lib/format-datetime'
import Link from 'next/link'
import { PublicPageWrapper } from '@/app/public-layout'
import { BLOG_CATEGORIES, blogPosts, categoryLabel, type BlogPostDoc } from '@/lib/db/blog-posts'
import { ensureBlogSeed } from '@/lib/blog-seed'
import { coverForPost } from '@/lib/blog-covers'
import { Clock, Search } from 'lucide-react'
import { HeroIllustration, PageHero } from '@/components/landing/page-hero'
import { EmptyState } from '@/components/ui/empty-state'

export const dynamic = 'force-dynamic'

function formatDate(iso?: string | null) {
  if (!iso) return ''
  try {
    return tzFormatDate(iso, undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

const seoRoute = publicRoute('/blog')!

/** Hub indexable; search and category filters are noindex,follow (SEO-021). */
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ category?: string; q?: string }> }): Promise<Metadata> {
  const sp = await searchParams
  return buildMetadata({ title: seoRoute.title, description: seoRoute.description, path: '/blog', kind: 'article', noIndex: sp.category || sp.q ? 'follow' : false })
}

export default async function BlogIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>
}) {
  const sp = await searchParams
  const category = (sp.category || '').trim()
  const q = (sp.q || '').trim().toLowerCase()

  await ensureBlogSeed()
  const col = await blogPosts()
  const filter: Record<string, unknown> = { status: 'published' }
  if (category && BLOG_CATEGORIES.some((c) => c.id === category)) {
    filter.category = category
  }

  let posts = await col
    .find(filter)
    .sort({ published_at: -1, created_at: -1 })
    .limit(48)
    .toArray()

  if (q) {
    posts = posts.filter(
      (p) =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.excerpt || '').toLowerCase().includes(q) ||
        (p.tags || []).some((t) => t.toLowerCase().includes(q)),
    )
  }

  const featured = posts[0]
  const rest = posts.slice(1)

  return (
    <PublicPageWrapper>
      <PageHero
        title="Newsroom"
        lead="Product updates, engineering notes, campus stories, and career Signals for builders."
        art={<HeroIllustration name="binary-brackets" width={360} height={240} />}
      />
      <div className="mx-auto w-full min-w-0 max-w-[1200px] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <nav aria-label="Article categories" className="mb-6 flex flex-wrap gap-2">
          <Chip href="/blog" active={!category} label="All" />
          {BLOG_CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              href={`/blog?category=${c.id}`}
              active={category === c.id}
              label={c.label}
            />
          ))}
        </nav>

        <form action="/blog" role="search" className="mb-10 max-w-md">
          {category ? <input type="hidden" name="category" value={category} /> : null}
          <label className="relative block">
            <span className="sr-only">Search articles</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cs-ink-soft" aria-hidden />
            <input
              type="search"
              name="q"
              defaultValue={sp.q || ''}
              placeholder="Search articles"
              className="h-11 w-full rounded-full border border-cs-grid bg-cs-sheet pl-11 pr-4 text-sm text-cs-ink outline-none ring-cs-accent/30 placeholder:text-cs-ink-soft/70 focus:border-cs-accent/50 focus:ring-2"
            />
          </label>
        </form>

        {posts.length === 0 ? (
          <EmptyState
            variant={q ? 'search' : 'default'}
            title={q ? 'No articles match your search' : 'No articles here yet'}
            description="Try another category or search term, or browse every article."
            actionLabel="See all articles"
            actionHref="/blog"
          />
        ) : (
          <div className="space-y-8">
            {featured ? <FeaturedCard post={featured} /> : null}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((p) => (
                <ArticleCard key={p.id} post={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </PublicPageWrapper>
  )
}

function Chip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex min-h-9 items-center rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors duration-200 ${
        active
          ? 'border-cs-accent bg-cs-accent text-cs-accent-ink'
          : 'border-cs-grid bg-cs-sheet text-cs-ink-soft hover:border-cs-accent/40 hover:text-cs-ink'
      }`}
    >
      {label}
    </Link>
  )
}

function Cover({ post, className }: { post: BlogPostDoc; className?: string }) {
  const src = coverForPost({
    title: post.title,
    category: post.category,
    cover_image: post.cover_image,
  })
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={className || 'h-full w-full object-cover'} />
  )
}

function FeaturedCard({ post }: { post: BlogPostDoc }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group grid overflow-hidden rounded-3xl border border-cs-grid bg-cs-sheet shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-12px_rgba(15,23,41,0.10)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-cs-accent/40 hover:shadow-[0_18px_40px_-18px_rgba(47,91,231,0.35)] motion-reduce:hover:translate-y-0 dark:shadow-none lg:grid-cols-2"
    >
      <div className="relative aspect-video lg:aspect-auto lg:min-h-80">
        <Cover post={post} />
      </div>
      <div className="flex flex-col justify-center space-y-3 p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2 text-xs text-cs-ink-soft">
          <span className="rounded-full bg-cs-accent/10 px-2 py-0.5 font-semibold text-cs-accent-text">
            {categoryLabel(post.category)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden /> <span className="tabular-nums">{post.read_minutes}</span> min read
          </span>
          <span>{formatDate(post.published_at)}</span>
        </div>
        <h2 className="cs-heading text-3xl text-cs-ink group-hover:text-cs-accent-text sm:text-4xl">
          {post.title}
        </h2>
        {post.excerpt ? (
          <p className="line-clamp-3 text-[15px] leading-relaxed text-cs-ink-soft">{post.excerpt}</p>
        ) : null}
        <p className="text-sm font-semibold text-cs-accent-text group-hover:underline">Read more →</p>
      </div>
    </Link>
  )
}

function ArticleCard({ post }: { post: BlogPostDoc }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex min-w-0 flex-col overflow-hidden rounded-3xl border border-cs-grid bg-cs-sheet shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-12px_rgba(15,23,41,0.10)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-cs-accent/40 hover:shadow-[0_18px_40px_-18px_rgba(47,91,231,0.35)] motion-reduce:hover:translate-y-0 dark:shadow-none"
    >
      <div className="aspect-video overflow-hidden bg-cs-paper">
        <Cover post={post} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:group-hover:scale-100" />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex items-center gap-2 text-xs text-cs-ink-soft">
          <span className="rounded-full bg-cs-accent/10 px-2 py-0.5 font-semibold text-cs-accent-text">
            {categoryLabel(post.category)}
          </span>
          <span className="tabular-nums">{post.read_minutes} min</span>
        </div>
        <h3 className="line-clamp-2 text-lg font-bold tracking-tight text-cs-ink group-hover:text-cs-accent-text">
          {post.title}
        </h3>
        {post.excerpt ? (
          <p className="line-clamp-2 text-sm text-cs-ink-soft">{post.excerpt}</p>
        ) : null}
        <p className="mt-auto pt-2 text-xs text-cs-ink-soft">
          {post.author_name}
          {post.published_at ? ` · ${formatDate(post.published_at)}` : ''}
        </p>
      </div>
    </Link>
  )
}
