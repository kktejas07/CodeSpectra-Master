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
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
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
      // Call the ingest function directly instead of via HTTP
      // This avoids CRON_SECRET issues and self-request problems
      try {
        const { fetchFeedItems } = await import('@/lib/signals/rss')
        const { rewriteSignal } = await import('@/lib/signals/rewrite')
        const { scrapeOgData } = await import('@/lib/signals/og-scraper')
        const { SIGNAL_FEEDS } = await import('@/lib/signals/feeds')
        const { newSignalId, signalDrafts: getDrafts } = await import('@/lib/db/signal-drafts')
        const { nowIso } = await import('@/lib/db/blog-posts')
        
        const drafts = await getDrafts()
        const created: string[] = []
        const skipped: string[] = []
        const errors: string[] = []
        
        for (const feed of SIGNAL_FEEDS.slice(0, 3)) {
          try {
            const items = await fetchFeedItems(feed.url, 1)
            console.log(`[signals] Feed ${feed.id}: fetched ${items.length} items`)
            for (const item of items) {
              const exists = await drafts.findOne({ source_url: item.link })
              if (exists) {
                skipped.push(item.link)
                console.log(`[signals] Skipped (exists): ${item.title}`)
                continue
              }
              
              let rewritten: Awaited<ReturnType<typeof rewriteSignal>> = null
              try {
                const ogData = await scrapeOgData(item.link)
                const summaryContext = ogData.description || ogData.title || item.summary
                const articleTitle = ogData.title || item.title
                
                rewritten = await rewriteSignal({
                  title: articleTitle,
                  summary: summaryContext,
                  sourceUrl: item.link,
                  category: feed.category,
                })
              } catch (rewriteErr) {
                console.warn(`[signals] AI rewrite failed for ${item.link}, using fallback draft:`, rewriteErr)
              }
              
              const now = nowIso()
              const sourceUrls = rewritten?.source_urls?.length ? rewritten.source_urls : [item.link]
              await drafts.insertOne({
                id: newSignalId(),
                title: rewritten?.title || item.title,
                excerpt: rewritten?.excerpt || item.summary?.slice(0, 220) || item.title,
                body: rewritten?.body || `<p>${item.summary || item.title}</p><p><a href="${item.link}" rel="noopener noreferrer">Source</a></p>`,
                category: feed.category,
                source_url: item.link,
                source_title: item.title,
                source_feed: feed.id,
                angle: rewritten?.angle,
                facts: rewritten?.facts,
                source_urls: sourceUrls,
                status: 'pending',
                created_at: now,
                updated_at: now,
              })
              created.push(item.link)
              console.log(`[signals] Created draft: ${item.title}${rewritten ? ' (AI)' : ' (fallback)'}`)
            }
          } catch (e) {
            console.error(`[signals] Feed ${feed.id} error:`, e)
            errors.push(`${feed.id}: feed could not be processed`)
          }
        }
        
        console.log(`[signals] Done: ${created.length} created, ${skipped.length} skipped, ${errors.length} errors`)
        return NextResponse.json({ created: created.length, skipped: skipped.length, errors })
      } catch (e) {
        console.error('[signals] Ingest error:', e)
        return NextResponse.json({ error: 'Something went wrong. Please try again.', created: 0 }, { status: 500 })
      }
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
        { 
          $set: { status: 'pending', updated_at: nowIso() },
          $unset: { blog_slug: '' }
        },
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
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
