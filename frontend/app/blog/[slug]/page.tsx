import { formatDate as tzFormatDate } from '@/lib/format-datetime'
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
    return tzFormatDate(iso, undefined, {
      year: 'numeric',
      month: 'short',
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
      <div className="relative w-full border-b border-cs-grid">
        <div className="relative aspect-21/9 min-h-55 w-full max-h-105 overflow-hidden bg-cs-paper sm:min-h-70">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-linear-to-t from-cs-paper via-cs-paper/20 to-transparent" />
        </div>
      </div>

      <div className="mx-auto w-full min-w-0 max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap items-center gap-1 text-sm text-cs-ink-soft">
          <Link href="/" className="hover:text-cs-ink">
            Home
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <Link href="/blog" className="hover:text-cs-ink">
            Newsroom
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <Link href={`/blog?category=${post.category}`} className="hover:text-cs-ink">
            {categoryLabel(post.category)}
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <span className="line-clamp-1 max-w-56 text-cs-ink sm:max-w-xs" aria-current="page">{post.title}</span>
        </nav>

        <div className="grid gap-10 xl:grid-cols-[1fr_minmax(0,46rem)_1fr]">
          <aside className="hidden xl:block">
            <div className="sticky top-28 space-y-3 pr-4">
              <p className="text-sm font-semibold text-cs-ink">
                On this page
              </p>
              {toc.length === 0 ? (
                <p className="text-sm text-cs-ink-soft">No sections</p>
              ) : (
                <ul className="space-y-2 border-l border-cs-grid pl-3">
                  {toc.map((t) => (
                    <li key={t.id}>
                      <a
                        href={`#${t.id}`}
                        className="text-sm text-cs-ink-soft hover:text-cs-accent-text"
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
            <p className="mb-3 text-sm font-semibold text-cs-accent-text">
              {categoryLabel(post.category)}
            </p>
            <h1 className="cs-display max-w-[22ch] text-4xl sm:text-5xl lg:text-6xl">{post.title}</h1>
            {post.excerpt ? (
              <p className="mt-5 max-w-[60ch] text-lg leading-relaxed text-cs-ink-soft">{post.excerpt}</p>
            ) : null}
            <div className="mt-5 flex flex-wrap items-center gap-3 border-b border-cs-grid pb-6 text-sm text-cs-ink-soft">
              <span>
                {post.author_name}
                {post.author_role ? ` · ${post.author_role}` : ''}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" aria-hidden /> <span className="tabular-nums">{post.read_minutes}</span> min read
              </span>
              <span>{formatDate(post.published_at)}</span>
            </div>

            <div
              className="prose prose-zinc mt-10 max-w-[72ch] dark:prose-invert prose-headings:scroll-mt-28 prose-headings:tracking-tight prose-headings:text-cs-ink prose-p:text-[17px] prose-p:leading-8 prose-p:text-cs-ink-soft prose-li:text-cs-ink-soft prose-strong:text-cs-ink prose-a:font-medium prose-a:text-cs-accent-text prose-img:rounded-2xl"
              dangerouslySetInnerHTML={{ __html: safeBody }}
            />

            {showSources ? (
              <div className="mt-10 max-w-[72ch] rounded-2xl border border-cs-grid bg-cs-sheet p-4 text-sm text-cs-ink-soft">
                {post.source_note && !/editorial synthesis|rewritten for codespectra/i.test(post.source_note) ? (
                  <p className="mb-2">{post.source_note}</p>
                ) : null}
                {post.source_urls?.length ? (
                  <ul className="space-y-1">
                    {post.source_urls.map((u) => (
                      <li key={u}>
                        <a
                          href={u}
                          className="inline-flex items-center gap-1 break-all text-cs-accent-text underline"
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {u.replace(/^https?:\/\//, '')}
                          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <p className="mt-10">
              <Link href="/blog" className="text-sm font-semibold text-cs-accent-text hover:underline">
                ← Back to Newsroom
              </Link>
            </p>
          </article>

          <aside className="space-y-6 xl:pl-4">
            <div className="rounded-3xl border border-cs-grid bg-cs-sheet p-5">
              <h2 className="text-base font-bold text-cs-ink">Newsletters</h2>
              <p className="mt-1 text-sm text-cs-ink-soft">
                Product and campus updates in your inbox.
              </p>
              <Link
                href="/newsletter"
                className="mt-4 inline-flex min-h-10 items-center rounded-full bg-cs-accent px-4 py-2 text-sm font-semibold text-cs-accent-ink transition-[filter] hover:brightness-110"
              >
                View newsletters
              </Link>
            </div>

            {related.length > 0 ? (
              <div>
                <h2 className="mb-3 text-base font-bold text-cs-ink">
                  Related
                </h2>
                <ul className="space-y-3">
                  {related.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/blog/${r.slug}`}
                        className="block rounded-2xl border border-cs-grid bg-cs-sheet p-3 text-sm font-medium text-cs-ink transition-colors duration-200 hover:border-cs-accent/40 hover:text-cs-accent-text"
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
