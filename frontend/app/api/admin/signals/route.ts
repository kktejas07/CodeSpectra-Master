/**
 * Admin Signals queue — list drafts / approve→publish / reject / run ingest.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser, requireSuperAdmin } from '@/lib/route-auth'
import { signalDrafts } from '@/lib/db/signal-drafts'
import {
  blogPosts,
  estimateReadMinutes,
  newBlogId,
  nowIso,
  slugifyTitle,
  type BlogPostDoc,
} from '@/lib/db/blog-posts'
import { coverForPost } from '@/lib/blog-covers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const col = await signalDrafts()
    const items = await col.find({}).sort({ created_at: -1 }).limit(50).toArray()
    return NextResponse.json({ items })
  } catch (e) {
    console.error('[signals] GET:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: 'approve' | 'reject' | 'ingest' | 'unpublish' | 'delete'
      id?: string
    }
    const action = body.action || 'approve'

    if (action === 'ingest') {
      const port = process.env.PORT || 80
      const secret = process.env.CRON_SECRET || ''
      const res = await fetch(
        `http://127.0.0.1:${port}/api/cron/signals-ingest?secret=${encodeURIComponent(secret)}`,
        { method: 'POST' },
      )
      const data = await res.json()
      return NextResponse.json(data, { status: res.status })
    }

    const id = String(body.id || '').trim()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const col = await signalDrafts()
    const draft = await col.findOne({ id })
    if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (action === 'reject') {
      await col.updateOne(
        { id },
        { $set: { status: 'rejected', updated_at: nowIso() } },
      )
      return NextResponse.json({ ok: true, status: 'rejected' })
    }

    if (action === 'unpublish') {
      if (draft.blog_slug) {
        const posts = await blogPosts()
        await posts.deleteOne({ slug: draft.blog_slug })
      }
      await col.updateOne(
        { id },
        { $set: { status: 'pending', blog_slug: null, updated_at: nowIso() } },
      )
      return NextResponse.json({ ok: true, status: 'pending' })
    }

    if (action === 'delete') {
      if (draft.blog_slug) {
        const posts = await blogPosts()
        await posts.deleteOne({ slug: draft.blog_slug })
      }
      await col.deleteOne({ id })
      return NextResponse.json({ ok: true, status: 'deleted' })
    }

    // approve → publish blog post
    const posts = await blogPosts()
    let slug = slugifyTitle(draft.title)
    if (await posts.findOne({ slug })) slug = `${slug}-${Date.now().toString(36)}`
    const now = nowIso()
    const user = await getAPIUser()

    const sourceUrls =
      draft.source_urls?.length ? draft.source_urls : [draft.source_url].filter(Boolean)
    const post: BlogPostDoc = {
      id: newBlogId(),
      slug,
      title: draft.title,
      excerpt: draft.excerpt,
      body: draft.body,
      category: draft.category,
      tags: ['signals', draft.source_feed],
      author_name: 'CodeSpectra Signals',
      author_role: 'Editorial',
      status: 'published',
      // Prefer the AI-generated art from the ingest pass; SVG fallback otherwise.
      cover_image: draft.cover_image || coverForPost({ title: draft.title, category: draft.category }),
      source_urls: sourceUrls,
      // Short feed attribution only — no long “editorial synthesis” disclaimer.
      source_note: draft.source_feed
        ? `Based on public reporting (${draft.source_feed}).`
        : undefined,
      read_minutes: estimateReadMinutes(draft.body),
      published_at: now,
      created_at: now,
      updated_at: now,
      created_by: user?.id || 'admin',
    }
    await posts.insertOne(post)
    await col.updateOne(
      { id },
      { $set: { status: 'published', blog_slug: slug, updated_at: now } },
    )

    return NextResponse.json({ ok: true, status: 'published', url: `/blog/${slug}`, post })
  } catch (e) {
    console.error('[signals] POST:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
