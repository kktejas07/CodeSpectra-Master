/**
 * Draft → published news post (blog_posts, tag 'signals'). Shared by the admin
 * "Approve" action and the ingest run's auto-publish for trusted feeds.
 * Server only.
 */
import { sanitizeArticleHtml, safeHttpUrl } from '@/lib/safe-html'
import { blogPosts, estimateReadMinutes, newBlogId, nowIso, slugifyTitle, type BlogPostDoc } from '@/lib/db/blog-posts'
import type { SignalDraftDoc } from '@/lib/db/signal-drafts'
import { coverForPost } from '@/lib/blog-covers'
import { newsTags } from './news'
import { revalidateContent } from '@/lib/cache/revalidate'

export async function publishDraft(draft: SignalDraftDoc, opts: { by: string; auto: boolean }): Promise<BlogPostDoc> {
  const posts = await blogPosts()
  let slug = slugifyTitle(draft.title)
  if (await posts.findOne({ slug })) slug = `${slug}-${Date.now().toString(36)}`
  const now = nowIso()
  const sourceUrls = (draft.source_urls?.length ? draft.source_urls : [draft.source_url])
    .map((u) => safeHttpUrl(u)).filter((u): u is string => !!u && /^https?:/i.test(u))
  const post: BlogPostDoc = {
    id: newBlogId(),
    slug,
    title: draft.title,
    excerpt: draft.excerpt,
    body: sanitizeArticleHtml(draft.body),
    category: draft.category,
    tags: newsTags(draft.source_feed, draft.topic),
    author_name: 'CodeSpectra Signals',
    author_role: 'Editorial',
    status: 'published',
    cover_image: draft.cover_image || coverForPost({ title: draft.title, category: draft.category }),
    source_urls: sourceUrls,
    // Short feed attribution only — no long “editorial synthesis” disclaimer.
    source_note: draft.source_feed ? `Based on public reporting (${draft.source_feed}).` : undefined,
    read_minutes: estimateReadMinutes(draft.body),
    published_at: now,
    created_at: now,
    updated_at: now,
    created_by: opts.by,
  }
  await posts.insertOne(post)
  const { draftsCol } = await import('./store')
  await (await draftsCol()).updateOne({ id: draft.id }, { $set: { status: 'published', blog_slug: slug, auto_published: opts.auto, updated_at: now } })
  await revalidateContent('news', slug)
  void import('@/lib/rag/hooks').then(({ knowledgeOnNewsPost }) => knowledgeOnNewsPost(post.id)).catch(() => undefined)
  return post
}
