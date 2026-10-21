/**
 * GET /hi/blog, /te/blog — the blog merged into Learn (like /blog → /learn):
 * 301 to the localized Learn hub, keeping ?category / ?q.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { blogIndexRedirect } from '@/lib/learn/team-posts'
import { isPrefixedLocale, localizedPath } from '@/lib/i18n/public-paths'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, ctx: { params: Promise<{ lang: string }> }) {
  const { lang } = await ctx.params
  if (!isPrefixedLocale(lang)) return new NextResponse('Not found', { status: 404 })
  return NextResponse.redirect(new URL(localizedPath(blogIndexRedirect(req.nextUrl.searchParams), lang), req.url), 301)
}
