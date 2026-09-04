/**
 * POST /api/admin/blog/ai-cover
 * Body: { slug } → regenerate cover art for an existing post (superadmin).
 * Body: { title, excerpt?, category? } → generate and return a URL without saving.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { buildNewsCoverPrompt, generateCoverImage } from '@/lib/ai-image'
import { nowIso } from '@/lib/db/blog-posts'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const body = (await req.json().catch(() => ({}))) as {
    slug?: string
    title?: string
    excerpt?: string
    category?: string
  }

  const db = await getMongoDb()
  let prompt = ''

  if (body.slug) {
    const post = await db.collection('blog_posts').findOne({ slug: body.slug })
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    prompt = buildNewsCoverPrompt({
      title: String(post.title || ''),
      excerpt: String(post.excerpt || ''),
      category: String(post.category || ''),
    })
  } else {
    prompt = buildNewsCoverPrompt({
      title: String(body.title || '').trim(),
      excerpt: String(body.excerpt || ''),
      category: String(body.category || ''),
    })
  }

  if (!prompt.trim()) {
    return NextResponse.json({ error: 'slug or title required' }, { status: 400 })
  }

  try {
    const url = await generateCoverImage(prompt)
    if (!url) {
      return NextResponse.json({ error: 'Image generation failed — try again' }, { status: 502 })
    }
    if (body.slug) {
      await db.collection('blog_posts').updateOne(
        { slug: body.slug },
        { $set: { cover_image: url, updated_at: nowIso() } },
      )
      return NextResponse.json({ ok: true, cover_image: url, saved: true })
    }
    return NextResponse.json({ ok: true, cover_image: url, saved: false })
  } catch (e) {
    console.error('[admin/blog/ai-cover]', e)
    return NextResponse.json({ error: 'Image generation failed' }, { status: 500 })
  }
}
