/**
 * Cron: ingest public RSS → research → fact pack → draft → humanize → signal_drafts (pending).
 * POST /api/cron/signals-ingest  ?secret=CRON_SECRET
 *
 * Never scrapes Unstop/closed sites. Human must approve before publish.
 * Cost: HTTP fetch/RSS = free. LLM = existing platform AI keys (usage).
 */
import { NextRequest, NextResponse } from 'next/server'
import { withCronHeartbeat } from '@/lib/cron-heartbeat'
import { SIGNAL_FEEDS } from '@/lib/signals/feeds'
import { fetchFeedItems } from '@/lib/signals/rss'
import { rewriteSignal } from '@/lib/signals/rewrite'
import { scrapeOgData } from '@/lib/signals/og-scraper'
import { newSignalId, signalDrafts, type SignalDraftDoc } from '@/lib/db/signal-drafts'
import { nowIso } from '@/lib/db/blog-posts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// 3 LLM passes × a few items — allow serverless room
export const maxDuration = 300

function authorize(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim()
  if (!expected) return process.env.NODE_ENV !== 'production'
  const url = new URL(req.url)
  const fromQuery = url.searchParams.get('secret') || ''
  const fromHeader = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  return fromQuery === expected || fromHeader === expected
}

async function postImpl(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const drafts = await signalDrafts()
  const created: string[] = []
  const skipped: string[] = []
  const errors: string[] = []

  // ponytail: 1 item/feed — 3 LLM calls each; ceiling ~N feeds per cron run
  for (const feed of SIGNAL_FEEDS) {
    try {
      const items = await fetchFeedItems(feed.url, 1)
      for (const item of items) {
        const exists = await drafts.findOne({ source_url: item.link })
        if (exists) {
          skipped.push(item.link)
          continue
        }

        // Scrape the actual link for real context (useful for HN feeds that just return URLs)
        const ogData = await scrapeOgData(item.link)
        const summaryContext = ogData.description || ogData.title || item.summary
        const articleTitle = ogData.title || item.title

        const rewritten = await rewriteSignal({
          title: articleTitle,
          summary: summaryContext,
          sourceUrl: item.link,
          category: feed.category,
        })

        const now = nowIso()
        const sourceUrls =
          rewritten?.source_urls?.length ? rewritten.source_urls : [item.link]
        const doc: SignalDraftDoc = {
          id: newSignalId(),
          title: rewritten?.title || item.title,
          excerpt: rewritten?.excerpt || item.summary.slice(0, 220) || item.title,
          body:
            rewritten?.body ||
            `<p>${item.summary || item.title}</p><p><a href="${item.link}" rel="noopener noreferrer">Source</a></p>`,
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
        }
        // Use publisher's og:image to avoid DMCA/context issues. NO AI generated images allowed per user request.
        if (ogData.image) {
          doc.cover_image = ogData.image
        }
        await drafts.insertOne(doc)
        created.push(doc.id)
      }
    } catch (e) {
      errors.push(`${feed.id}: ${String(e)}`)
    }
  }

  return NextResponse.json({
    ok: true,
    created: created.length,
    skipped: skipped.length,
    errors,
    ids: created,
  })
}

export const POST = withCronHeartbeat('signals-ingest', postImpl)

export async function GET(req: NextRequest) {
  return POST(req)
}
