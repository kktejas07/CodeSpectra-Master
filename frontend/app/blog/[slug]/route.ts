/**
 * GET /blog/<slug> — 301 to the post's new home: /news/<slug> for news,
 * /learn/<slug> (or /learn/team-<slug> when a Learn post owns the slug).
 */
import { NextResponse, type NextRequest } from 'next/server'
import { blogPostRedirect } from '@/lib/learn/team-posts'
import { blogRedirectFacts } from '@/lib/learn/team-queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const raw = (await ctx.params).slug || ''
  if (raw === 'rss.xml' || raw === 'feed.xml') return NextResponse.redirect(new URL('/learn/rss.xml', req.url), 301)
  const slug = /^[a-z0-9][a-z0-9-]{0,119}$/.test(raw) ? raw : ''
  if (!slug) return NextResponse.redirect(new URL('/learn', req.url), 301)
  let facts: Awaited<ReturnType<typeof blogRedirectFacts>> = { post: null, collides: false }
  try {
    facts = await blogRedirectFacts(slug)
  } catch (e) {
    console.error('[blog] redirect lookup:', (e as Error)?.message)
  }
  return NextResponse.redirect(new URL(blogPostRedirect(slug, facts.post, facts.collides), req.url), 301)
}
