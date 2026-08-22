/**
 * Cron: ingest public RSS → AI rewrite → signal_drafts (pending).
 * POST /api/cron/signals-ingest  ?secret=CRON_SECRET
 *
 * Never scrapes Unstop/closed sites. Human must approve before publish.
 */
import { NextRequest, NextResponse } from 'next/server'
import { SIGNAL_FEEDS } from '@/lib/signals/feeds'
import { fetchFeedItems } from '@/lib/signals/rss'
import { rewriteSignal } from '@/lib/signals/rewrite'
import { newSignalId, signalDrafts, type SignalDraftDoc } from '@/lib/db/signal-drafts'
import { nowIso } from '@/lib/db/blog-posts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

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

  for (const feed of SIGNAL_FEEDS) {
    try {
      const items = await fetchFeedItems(feed.url, 3)
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
          status: 'pending',
          created_at: now,
          updated_at: now,
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
