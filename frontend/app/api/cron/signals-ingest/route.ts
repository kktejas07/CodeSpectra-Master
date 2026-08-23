/**
 * Cron: ingest public RSS → research → fact pack → draft → humanize → signal_drafts (pending).
 * POST /api/cron/signals-ingest  ?secret=CRON_SECRET
 *
 * Never scrapes Unstop/closed sites. Human must approve before publish.
 * Cost: HTTP fetch/RSS = free. LLM = existing platform AI keys (usage).
 */
import { NextRequest, NextResponse } from 'next/server'
import { SIGNAL_FEEDS } from '@/lib/signals/feeds'
import { fetchFeedItems } from '@/lib/signals/rss'
import { rewriteSignal } from '@/lib/signals/rewrite'
import { newSignalId, signalDrafts, type SignalDraftDoc } from '@/lib/db/signal-drafts'
import { nowIso } from '@/lib/db/blog-posts'
import { buildNewsCoverPrompt, generateCoverImage } from '@/lib/ai-image'

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

export async function POST(req: NextRequest) {
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

        const rewritten = await rewriteSignal({
          title: item.title,
          summary: item.summary,
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
        // Cover art from the news itself — best effort, never blocks the draft.
        try {
          const cover = await generateCoverImage(
            buildNewsCoverPrompt({ title: doc.title, excerpt: doc.excerpt, category: feed.category }),
          )
          if (cover) doc.cover_image = cover
        } catch {
          /* SVG fallback kicks in at render time */
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

export async function GET(req: NextRequest) {
  return POST(req)
}
