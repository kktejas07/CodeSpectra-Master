/**
 * Cron: generate one draft ebook per day from the rotating topic list.
 * POST /api/cron/ebooks-daily  ?secret=CRON_SECRET
 *
 * Original CodeSpectra content only — no scraping copyrighted books.
 * Human publishes from /dashboard/admin/resources.
 */
import { NextRequest, NextResponse } from 'next/server'
import { ebooksCol } from '@/lib/db/ebooks'
import { generateEbookDraft, topicForDay } from '@/lib/ebooks-generate'
// topicForDay exported as topicForDay
import { ensureEbookSeed } from '@/lib/ebooks-seed'
import { buildEbookCoverPrompt, generateCoverImage } from '@/lib/ai-image'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

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

  await ensureEbookSeed('system')
  const topic = topicForDay()
  const dayKey = new Date().toISOString().slice(0, 10)
  const col = await ebooksCol()

  const existing = await col.findOne({
    topic,
    createdAt: { $gte: `${dayKey}T00:00:00.000Z` },
    createdBy: 'cron',
  })
  if (existing) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'already_today', slug: existing.slug })
  }

  const { ebook, usedAi } = await generateEbookDraft({
    topic,
    status: 'draft',
    createdBy: 'cron',
    useAi: true,
  })
  ebook.sourceNote = `Daily cron draft · ${dayKey}`

  const clash = await col.findOne({ slug: ebook.slug })
  if (clash) ebook.slug = `${ebook.slug}-${dayKey.replace(/-/g, '')}`

  // Automatic AI cover art from the topic — best effort, never blocks the draft.
  try {
    const art = await generateCoverImage(
      buildEbookCoverPrompt({ topic: ebook.topic, title: ebook.title }),
      { width: 768, height: 1024 },
    )
    if (art) ebook.coverImageUrl = art
  } catch {
    /* keep gradient cover */
  }

  await col.insertOne(ebook)
  return NextResponse.json({ ok: true, usedAi, slug: ebook.slug, topic, status: ebook.status })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
