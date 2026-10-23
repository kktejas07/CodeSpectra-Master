/**
 * Approve (publish) or reject a pending tech-news draft (server only) — shared by
 * POST /api/admin/signals and the copilot's review_news_draft proposal (AGT-033).
 */
import 'server-only'
import { nowIso } from '@/lib/db/blog-posts'
import { draftsCol } from './store'

export type NewsReviewResult = { ok: true; status: 'published' | 'rejected'; url?: string; slug?: string } | { ok: false; status: number; error: string }

export async function reviewNewsDraft(id: string, action: 'approve' | 'reject', actorId: string): Promise<NewsReviewResult> {
  const col = await draftsCol()
  const draft = await col.findOne({ id }, { projection: { _id: 0 } })
  if (!draft) return { ok: false, status: 404, error: 'News draft not found' }
  if (action === 'reject') {
    if (draft.status === 'published') return { ok: false, status: 409, error: 'This article is live. Unpublish it in Admin → Signals instead.' }
    await col.updateOne({ id }, { $set: { status: 'rejected', updated_at: nowIso() } })
    return { ok: true, status: 'rejected' }
  }
  if (draft.status === 'published') return { ok: true, status: 'published', url: `/news/${draft.blog_slug}`, slug: draft.blog_slug }
  const { publishDraft } = await import('./publish')
  const post = await publishDraft(draft, { by: actorId, auto: false })
  return { ok: true, status: 'published', url: `/news/${post.slug}`, slug: post.slug }
}
