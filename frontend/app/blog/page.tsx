import Link from 'next/link'
import { PublicPageWrapper } from '@/app/public-layout'
import { BLOG_CATEGORIES, blogPosts, categoryLabel, type BlogPostDoc } from '@/lib/db/blog-posts'
import { ensureBlogSeed } from '@/lib/blog-seed'
import { Clock, Newspaper, Search } from 'lucide-react'

export const dynamic = 'force-dynamic'

function formatDate(iso?: string | null) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
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
  const latest = posts.slice(0, 5)

  return (
    <PublicPageWrapper>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-3xl">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
            Newsroom
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Explore <span className="text-teal-600 dark:text-teal-400">Articles</span>
          </h1>
          <p className="mt-3 text-muted-foreground">
            Product updates, engineering notes, and career Signals — rewritten for builders, not
            recycled headlines.
          </p>
        </div>

        <div className="mb-8 flex flex-wrap gap-2">
          <Chip href="/blog" active={!category} label="All" />
          {BLOG_CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              href={`/blog?category=${c.id}`}
              active={category === c.id}
              label={c.label}
            />
          ))}
        </div>

        <form action="/blog" className="mb-10 max-w-md">
          {category ? <input type="hidden" name="category" value={category} /> : null}
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              name="q"
              defaultValue={sp.q || ''}
              placeholder="Search articles"
              className="w-full rounded-full border border-border bg-background py-2.5 pl-10 pr-4 text-sm outline-none ring-teal-500/40 focus:ring-2"
            />
          </label>
        </form>

        {posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            <Newspaper className="mx-auto mb-3 h-10 w-10 opacity-40" />
            <p>No articles in this view yet.</p>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="space-y-8 lg:col-span-2">
              {featured && <FeaturedCard post={featured} />}
              <div className="grid gap-5 sm:grid-cols-2">
                {rest.map((p) => (
                  <ArticleCard key={p.id} post={p} />
                ))}
              </div>
            </div>

            <aside className="space-y-4">
              <h2 className="text-lg font-semibold text-teal-700 dark:text-teal-400">Just in</h2>
              <ul className="space-y-3">
                {latest.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/blog/${p.slug}`}
                      className="group flex gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-teal-500/40"
                    >
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500/20 to-cyan-500/10 text-xs font-bold text-teal-700 dark:text-teal-300">
                        {(p.category || 'CS').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-medium group-hover:text-teal-600 dark:group-hover:text-teal-400">
                          {p.title}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {formatDate(p.published_at)} · {p.read_minutes} min
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>
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
      className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? 'border-teal-500 bg-teal-500/15 text-teal-700 dark:text-teal-300'
          : 'border-border text-muted-foreground hover:border-teal-500/40 hover:text-foreground'
      }`}
    >
      {label}
    </Link>
  )
}

function FeaturedCard({ post }: { post: BlogPostDoc }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group block overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-teal-500/40"
    >
      <div className="relative aspect-[16/9] bg-gradient-to-br from-teal-600/30 via-emerald-500/10 to-cyan-500/20">
        {post.cover_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.cover_image} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-end p-6">
            <span className="rounded-full bg-background/80 px-3 py-1 text-xs font-semibold text-teal-700 backdrop-blur dark:text-teal-300">
              {categoryLabel(post.category)}
            </span>
          </div>
        )}
      </div>
      <div className="space-y-3 p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-teal-500/10 px-2 py-0.5 font-medium text-teal-700 dark:text-teal-300">
            {categoryLabel(post.category)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> {post.read_minutes} min read
          </span>
          <span>{formatDate(post.published_at)}</span>
        </div>
        <h2 className="text-xl font-bold tracking-tight group-hover:text-teal-600 dark:group-hover:text-teal-400 sm:text-2xl">
          {post.title}
        </h2>
        {post.excerpt && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{post.excerpt}</p>
        )}
        <p className="text-sm font-medium text-teal-600 dark:text-teal-400">Read more →</p>
      </div>
    </Link>
  )
}

function ArticleCard({ post }: { post: BlogPostDoc }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-teal-500/40"
    >
      <div className="aspect-[16/10] bg-gradient-to-br from-slate-800/40 to-teal-900/20">
        {post.cover_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.cover_image} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-full bg-teal-500/10 px-2 py-0.5 font-medium text-teal-700 dark:text-teal-300">
            {categoryLabel(post.category)}
          </span>
          <span>{post.read_minutes} min</span>
        </div>
        <h3 className="line-clamp-2 text-base font-semibold group-hover:text-teal-600 dark:group-hover:text-teal-400">
          {post.title}
        </h3>
        {post.excerpt && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{post.excerpt}</p>
        )}
        <p className="mt-auto pt-2 text-[11px] text-muted-foreground">
          {post.author_name}
          {post.published_at ? ` · ${formatDate(post.published_at)}` : ''}
        </p>
      </div>
    </Link>
  )
}
