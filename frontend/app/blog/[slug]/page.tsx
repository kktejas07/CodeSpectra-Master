import Link from 'next/link'
import { notFound } from 'next/navigation'
import DOMPurify from 'isomorphic-dompurify'
import { PublicPageWrapper } from '@/app/public-layout'
import { blogPosts, categoryLabel } from '@/lib/db/blog-posts'
import { ensureBlogSeed } from '@/lib/blog-seed'
import { coverForPost } from '@/lib/blog-covers'
import { Clock, ChevronRight, ExternalLink } from 'lucide-react'

export const dynamic = 'force-dynamic'

function formatDate(iso?: string | null) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

function extractToc(html: string): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = []
  const re = /<h2[^>]*>(.*?)<\/h2>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const text = m[1].replace(/<[^>]+>/g, '').trim()
    if (!text) continue
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    out.push({ id, text })
  }
  return out
}

function injectHeadingIds(html: string): string {
  return html.replace(/<h2([^>]*)>(.*?)<\/h2>/gi, (_full, attrs, inner) => {
    const text = String(inner).replace(/<[^>]+>/g, '').trim()
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    if (/id\s*=/.test(attrs)) return `<h2${attrs}>${inner}</h2>`
    return `<h2${attrs} id="${id}">${inner}</h2>`
  })
}

function shouldShowSourceNote(note?: string | null, urls?: string[] | null): boolean {
  if (urls && urls.length > 0) return true
  if (!note) return false
  // Hide the old generic disclaimer — not useful on original CodeSpectra posts.
  if (/editorial synthesis|rewritten for codespectra/i.test(note)) return false
  return true
}

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  await ensureBlogSeed()
  const col = await blogPosts()
  const post = await col.findOne({ slug, status: 'published' })
  if (!post) notFound()

  const related = await col
    .find({ status: 'published', category: post.category, slug: { $ne: post.slug } })
    .sort({ published_at: -1 })
    .limit(4)
    .toArray()

  const toc = extractToc(post.body || '')
  const safeBody = DOMPurify.sanitize(injectHeadingIds(post.body || ''))
  const cover = coverForPost({
    title: post.title,
    category: post.category,
    cover_image: post.cover_image,
  })
  const showSources = shouldShowSourceNote(post.source_note, post.source_urls)

  return (
    <PublicPageWrapper>
      {/* Full-bleed cover */}
      <div className="relative w-full border-b border-border/60">
        <div className="relative aspect-[21/9] min-h-[220px] w-full max-h-[420px] overflow-hidden bg-muted sm:min-h-[280px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
        </div>
      </div>

      <div className="w-full min-w-0 px-4 py-8 sm:px-6 lg:px-10 xl:px-12">
        <nav className="mb-6 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/blog" className="hover:text-foreground">
            Newsroom
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link href={`/blog?category=${post.category}`} className="hover:text-foreground">
            {categoryLabel(post.category)}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="line-clamp-1 max-w-[14rem] text-foreground sm:max-w-xs">{post.title}</span>
        </nav>

        <div className="grid gap-10 xl:grid-cols-[1fr_minmax(0,48rem)_1fr]">
          <aside className="hidden xl:block">
            <div className="sticky top-28 space-y-3 pr-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                On this page
              </p>
              {toc.length === 0 ? (
                <p className="text-xs text-muted-foreground">No sections</p>
              ) : (
                <ul className="space-y-2 border-l border-border pl-3">
                  {toc.map((t) => (
                    <li key={t.id}>
                      <a
                        href={`#${t.id}`}
                        className="text-xs text-muted-foreground hover:text-teal-600 dark:hover:text-teal-400"
                      >
                        {t.text}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>

          <article className="min-w-0">
            <p className="mb-3 text-sm font-semibold text-teal-600 dark:text-teal-400">
              {categoryLabel(post.category)}
            </p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">{post.title}</h1>
            {post.excerpt ? (
              <p className="mt-4 text-lg text-muted-foreground">{post.excerpt}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>
                {post.author_name}
                {post.author_role ? ` · ${post.author_role}` : ''}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> {post.read_minutes} min read
              </span>
              <span>{formatDate(post.published_at)}</span>
            </div>

            <div
              className="prose prose-zinc mt-10 max-w-none dark:prose-invert prose-headings:scroll-mt-28 prose-a:text-teal-600 dark:prose-a:text-teal-400"
              dangerouslySetInnerHTML={{ __html: safeBody }}
            />

            {showSources ? (
              <div className="mt-10 rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
                {post.source_note && !/editorial synthesis|rewritten for codespectra/i.test(post.source_note) ? (
                  <p className="mb-2">{post.source_note}</p>
                ) : null}
                {post.source_urls?.length ? (
                  <ul className="space-y-1">
                    {post.source_urls.map((u) => (
                      <li key={u}>
                        <a
                          href={u}
                          className="inline-flex items-center gap-1 text-teal-600 underline dark:text-teal-400"
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {u.replace(/^https?:\/\//, '')}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <p className="mt-10">
              <Link href="/blog" className="text-sm text-teal-600 hover:underline dark:text-teal-400">
                ← Back to Newsroom
              </Link>
            </p>
          </article>

          <aside className="space-y-6 xl:pl-4">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">Newsletters</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Product and campus updates in your inbox.
              </p>
              <Link
                href="/newsletter"
                className="mt-4 inline-flex rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-500"
              >
                View newsletters
              </Link>
            </div>

            {related.length > 0 ? (
              <div>
                <h2 className="mb-3 text-sm font-semibold text-teal-700 dark:text-teal-400">
                  Related
                </h2>
                <ul className="space-y-3">
                  {related.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/blog/${r.slug}`}
                        className="block rounded-xl border border-border p-3 text-sm font-medium hover:border-teal-500/40 hover:text-teal-600 dark:hover:text-teal-400"
                      >
                        {r.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </PublicPageWrapper>
  )
}
