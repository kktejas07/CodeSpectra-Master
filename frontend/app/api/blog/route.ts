import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser, requireSuperAdmin } from '@/lib/route-auth'
import {
  BLOG_CATEGORIES,
  blogPosts,
  estimateReadMinutes,
  isBlogCategory,
  newBlogId,
  nowIso,
  slugifyTitle,
  type BlogPostDoc,
} from '@/lib/db/blog-posts'
import { ensureBlogSeed } from '@/lib/blog-seed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/blog — published posts (public). Admin: ?status=all|draft */
export async function GET(req: NextRequest) {
  try {
    await ensureBlogSeed()
    const col = await blogPosts()
    const { searchParams } = req.nextUrl
    const category = searchParams.get('category') || ''
    const q = (searchParams.get('q') || '').trim().toLowerCase()
    const statusParam = searchParams.get('status') || 'published'
    const limit = Math.min(Number(searchParams.get('limit') || 24), 100)

    const filter: Record<string, unknown> = {}
    if (statusParam === 'published') {
      filter.status = 'published'
    } else if (statusParam === 'all' || statusParam === 'draft') {
      const gate = await requireSuperAdmin()
      if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
      if (statusParam === 'draft') filter.status = 'draft'
    } else {
      filter.status = 'published'
    }

    if (category && isBlogCategory(category)) filter.category = category

    let list = await col
      .find(filter)
      .sort({ published_at: -1, created_at: -1 })
      .limit(limit)
      .toArray()

    if (q) {
      list = list.filter(
        (p) =>
          (p.title || '').toLowerCase().includes(q) ||
          (p.excerpt || '').toLowerCase().includes(q) ||
          (p.tags || []).some((t) => t.toLowerCase().includes(q)),
      )
    }

    return NextResponse.json({ items: list, categories: BLOG_CATEGORIES, total: list.length })
  } catch (e) {
    console.error('[blog] GET list:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

/** POST /api/blog — create (superadmin) */
export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const body = (await req.json().catch(() => ({}))) as Partial<BlogPostDoc> & { publish?: boolean }
    const title = String(body.title || '').trim()
    if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })

    const category = isBlogCategory(String(body.category || '')) ? body.category! : 'product'
    const html = String(body.body || '')
    const now = nowIso()
    const publish = body.publish === true || body.status === 'published'
    let slug = slugifyTitle(String(body.slug || title))
    const col = await blogPosts()
    if (await col.findOne({ slug })) slug = `${slug}-${Date.now().toString(36)}`

    const user = await getAPIUser()
    const doc: BlogPostDoc = {
      id: newBlogId(),
      slug,
      title,
      excerpt: String(body.excerpt || '').trim().slice(0, 400),
      body: html,
      cover_image: String(body.cover_image || '') || undefined,
      category,
      tags: Array.isArray(body.tags) ? body.tags.map(String).slice(0, 12) : [],
      author_name: String(body.author_name || user?.name || 'CodeSpectra').trim(),
      author_role: String(body.author_role || '').trim() || undefined,
      status: publish ? 'published' : 'draft',
      source_urls: Array.isArray(body.source_urls) ? body.source_urls.map(String) : undefined,
      source_note: body.source_note ? String(body.source_note) : undefined,
      newsletter_campaign_id: body.newsletter_campaign_id
        ? String(body.newsletter_campaign_id)
        : undefined,
      read_minutes: estimateReadMinutes(html),
      published_at: publish ? now : null,
      created_at: now,
      updated_at: now,
      created_by: user?.id || 'admin',
    }

    await col.insertOne(doc)
    
    // Notify superadmins if published
    if (publish) {
      const { notifySuperAdmins } = await import('@/lib/notifications')
      await notifySuperAdmins({
        type: 'content.post_published',
        title: 'Blog Post Published',
        message: `A new blog post "${doc.title}" has been published.`,
        link: `/blog/${doc.slug}`,
      })
    }
    
    return NextResponse.json({ post: doc }, { status: 201 })
  } catch (e) {
    console.error('[blog] POST:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
