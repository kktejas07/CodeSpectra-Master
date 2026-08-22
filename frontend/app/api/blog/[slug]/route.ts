import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import {
  blogPosts,
  estimateReadMinutes,
  isBlogCategory,
  nowIso,
  slugifyTitle,
  type BlogPostDoc,
} from '@/lib/db/blog-posts'
import { ensureBlogSeed } from '@/lib/blog-seed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await ensureBlogSeed()
    const { slug } = await ctx.params
    const col = await blogPosts()
    const post = await col.findOne({ slug })
    if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (post.status !== 'published') {
      const gate = await requireSuperAdmin()
      if ('error' in gate) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const related = await col
      .find({ status: 'published', category: post.category, slug: { $ne: post.slug } })
      .sort({ published_at: -1 })
      .limit(4)
      .project({
        id: 1,
        slug: 1,
        title: 1,
        excerpt: 1,
        cover_image: 1,
        read_minutes: 1,
        category: 1,
        published_at: 1,
      })
      .toArray()

    return NextResponse.json({ post, related })
  } catch (e) {
    console.error('[blog] GET slug:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const { slug } = await ctx.params
    const body = (await req.json().catch(() => ({}))) as Partial<BlogPostDoc> & { publish?: boolean }
    const col = await blogPosts()
    const existing = await col.findOne({ slug })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const patch: Partial<BlogPostDoc> = { updated_at: nowIso() }
    if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim()
    if (typeof body.excerpt === 'string') patch.excerpt = body.excerpt.trim().slice(0, 400)
    if (typeof body.body === 'string') {
      patch.body = body.body
      patch.read_minutes = estimateReadMinutes(body.body)
    }
    if (typeof body.cover_image === 'string') patch.cover_image = body.cover_image || undefined
    if (typeof body.category === 'string' && isBlogCategory(body.category)) patch.category = body.category
    if (Array.isArray(body.tags)) patch.tags = body.tags.map(String).slice(0, 12)
    if (typeof body.author_name === 'string') patch.author_name = body.author_name.trim()
    if (typeof body.author_role === 'string') patch.author_role = body.author_role.trim() || undefined
    if (typeof body.slug === 'string' && body.slug.trim() && body.slug !== existing.slug) {
      const next = slugifyTitle(body.slug)
      if (await col.findOne({ slug: next })) {
        return NextResponse.json({ error: 'slug taken' }, { status: 409 })
      }
      patch.slug = next
    }
    if (body.publish === true || body.status === 'published') {
      patch.status = 'published'
      patch.published_at = existing.published_at || nowIso()
    } else if (body.status === 'draft' || body.status === 'archived') {
      patch.status = body.status
    }

    await col.updateOne({ id: existing.id }, { $set: patch })
    return NextResponse.json({ post: await col.findOne({ id: existing.id }) })
  } catch (e) {
    console.error('[blog] PATCH:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const { slug } = await ctx.params
    const r = await (await blogPosts()).deleteOne({ slug })
    if (!r.deletedCount) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[blog] DELETE:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
