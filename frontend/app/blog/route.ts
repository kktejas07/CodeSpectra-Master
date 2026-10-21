/**
 * GET /blog — the blog merged into Learn: 301 to /learn, keeping ?category
 * (as ?source=team&category=…) and ?q; news category goes to /news.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { blogIndexRedirect } from '@/lib/learn/team-posts'

export const dynamic = 'force-dynamic'

export function GET(req: NextRequest) {
  return NextResponse.redirect(new URL(blogIndexRedirect(req.nextUrl.searchParams), req.url), 301)
}
