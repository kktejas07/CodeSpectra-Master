/** GET /api/learn/[slug] — one published post (public). */
import { NextRequest, NextResponse } from 'next/server'
import { getPublishedPost } from '@/lib/learn/queries'
import { serverError } from '@/lib/learn/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params
    const post = await getPublishedPost(slug)
    if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    // Internal review fields stay private.
    const { quality: _q, reviewed_by: _r, reject_reason: _j, model: _m, topic_id: _t, ...pub } = post
    return NextResponse.json({ post: pub })
  } catch (e) {
    return serverError('get', e)
  }
}
