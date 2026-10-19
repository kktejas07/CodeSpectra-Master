/**
 * Post operations shared by the admin API and the scheduler: state changes
 * (with the copilot index hook), admin edits, publishing due scheduled posts,
 * and view/share counters. Server only.
 */
import { knowledgeOnLearnPost } from '@/lib/rag/hooks'
import { learnPosts } from './store'
import { transition, type LearnAction } from './state'
import { readingMinutes, sanitizeMarkdown } from './markdown'
import { findDuplicateTitle, slugify, uniqueSlug } from './topics'
import { isLearnCategory, isLearnLevel, type LearnPostDoc, type ShareChannel } from './types'

/**
 * Automation event for a post going live. Keyed per post, so a republish after
 * an unpublish (or the scheduler + an admin racing) emits once.
 */
export function emitPostPublished(p: Pick<LearnPostDoc, 'id' | 'slug' | 'title' | 'summary' | 'tags'>): void {
  void (async () => {
    const { emit } = await import('@/lib/automation/events')
    const { getAppOrigin } = await import('@/lib/app-origin')
    await emit('learn.post.published', {
      post_id: p.id, title: p.title, url: `${getAppOrigin()}/learn/${p.slug}`, summary: p.summary, tags: p.tags ?? [],
    }, { idempotencyKey: `learn.post.published:${p.id}` })
  })().catch(() => undefined)
}

export async function applyPostAction(
  id: string,
  action: LearnAction,
  opts: { reason?: unknown; publishAt?: unknown; actorId: string | null },
): Promise<{ post?: LearnPostDoc; error?: string; status?: number }> {
  const col = await learnPosts()
  const cur = await col.findOne({ id }, { projection: { _id: 0 } })
  if (!cur) return { error: 'Post not found.', status: 404 }
  const t = transition(cur.status, action, { reason: opts.reason, publishAt: opts.publishAt, actorId: opts.actorId })
  if (!t.ok) return { error: t.error, status: 409 }
  // Compare-and-set on the status we validated against (two admins clicking at once).
  // A republish keeps the first published_at so links/feeds don't reorder.
  const set = { ...t.set }
  if (action === 'publish' && cur.published_at && cur.status === 'archived') set.published_at = cur.published_at
  const r = await col.findOneAndUpdate({ id, status: cur.status }, { $set: set }, { returnDocument: 'after', projection: { _id: 0 } })
  if (!r) return { error: 'The post changed while you were reviewing it. Reload and try again.', status: 409 }
  if (cur.status === 'published' || r.status === 'published') knowledgeOnLearnPost(id)
  if (r.status === 'published' && cur.status !== 'published') emitPostPublished(r as LearnPostDoc)
  return { post: r as LearnPostDoc }
}

export type PostEdit = { title?: unknown; summary?: unknown; body?: unknown; level?: unknown; category?: unknown; tags?: unknown; featured?: unknown; slug?: unknown; series?: unknown }

/** Admin edit: sanitises markdown, recomputes reading time, keeps slugs unique. */
export async function editPost(id: string, edit: PostEdit): Promise<{ post?: LearnPostDoc; error?: string; status?: number }> {
  const col = await learnPosts()
  const cur = await col.findOne({ id }, { projection: { _id: 0 } })
  if (!cur) return { error: 'Post not found.', status: 404 }
  const set: Partial<LearnPostDoc> = { updated_at: new Date().toISOString() }
  if (typeof edit.title === 'string') {
    const title = edit.title.trim().replace(/\s+/g, ' ').slice(0, 140)
    if (title.length < 8) return { error: 'The title is too short.', status: 400 }
    set.title = title
  }
  if (typeof edit.summary === 'string') {
    const s = edit.summary.trim().slice(0, 400)
    if (s.length < 20) return { error: 'The summary is too short.', status: 400 }
    set.summary = s
  }
  if (typeof edit.body === 'string') {
    const body = sanitizeMarkdown(edit.body)
    if (body.length < 200) return { error: 'The post body is too short.', status: 400 }
    set.body = body
    set.reading_minutes = readingMinutes(body)
  }
  if (edit.level !== undefined) { if (!isLearnLevel(edit.level)) return { error: 'Pick a level.', status: 400 }; set.level = edit.level }
  if (edit.category !== undefined) { if (!isLearnCategory(edit.category)) return { error: 'Pick a category.', status: 400 }; set.category = edit.category }
  if (edit.tags !== undefined) {
    const list = Array.isArray(edit.tags) ? edit.tags : typeof edit.tags === 'string' ? edit.tags.split(',') : []
    set.tags = [...new Set(list.map((t) => String(t).trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 10)
  }
  if (edit.featured !== undefined) set.featured = edit.featured === true
  if (edit.series !== undefined) set.series = typeof edit.series === 'string' && edit.series.trim() ? edit.series.trim().slice(0, 80) : null
  if (typeof edit.slug === 'string' && edit.slug.trim() && edit.slug.trim() !== cur.slug) {
    // Published URLs are shared on social networks: don't break them.
    if (cur.status === 'published' || cur.published_at) return { error: 'This post has been published; its link can no longer change.', status: 409 }
    const base = slugify(edit.slug)
    const taken = new Set((await col.find({ slug: { $regex: `^${base}(-\\d+)?$` }, id: { $ne: id } }, { projection: { slug: 1 } }).toArray()).map((p) => p.slug))
    set.slug = uniqueSlug(base, taken)
  }
  if (set.title && set.title !== cur.title) {
    const others = await col.find({ id: { $ne: id }, status: { $in: ['published', 'scheduled', 'approved'] } }, { projection: { title: 1 } }).limit(2000).toArray()
    const dup = findDuplicateTitle(set.title, others.map((o) => o.title))
    if (dup) return { error: `Another post already covers this: "${dup}".`, status: 409 }
  }
  try {
    const r = await col.findOneAndUpdate({ id }, { $set: set }, { returnDocument: 'after', projection: { _id: 0 } })
    if (r?.status === 'published') knowledgeOnLearnPost(id)
    return { post: r as LearnPostDoc }
  } catch {
    return { error: 'That link is already used by another post.', status: 409 }
  }
}

/** Publish scheduled posts whose time has come. Idempotent (status compare-and-set). */
export async function publishDuePosts(now: Date = new Date()): Promise<number> {
  const col = await learnPosts()
  const due = await col.find({ status: 'scheduled', publish_at: { $lte: now.toISOString() } }, { projection: { _id: 0, id: 1, published_at: 1, slug: 1, title: 1, summary: 1, tags: 1 } }).limit(50).toArray()
  let n = 0
  for (const p of due) {
    const nowIso = now.toISOString()
    const r = await col.updateOne(
      { id: p.id, status: 'scheduled' },
      { $set: { status: 'published', published_at: p.published_at || nowIso, publish_at: null, updated_at: nowIso } },
    )
    if (r.modifiedCount) {
      n++
      knowledgeOnLearnPost(p.id)
      emitPostPublished(p as LearnPostDoc)
    }
  }
  return n
}

/** Count a view or a share on a published post. Returns false when the post isn't public. */
export async function trackPostEvent(slug: string, ev: { type: 'view' } | { type: 'share'; channel: ShareChannel }): Promise<boolean> {
  const col = await learnPosts()
  const inc: Record<string, number> = ev.type === 'view' ? { 'stats.views': 1 } : { [`stats.shares.${ev.channel}`]: 1, 'stats.share_total': 1 }
  const r = await col.updateOne({ slug, status: 'published' }, { $inc: inc })
  return r.matchedCount === 1
}
