/**
 * Cron: generate one draft ebook per day from the rotating topic list.
 * POST /api/cron/ebooks-daily  (Authorization: Bearer CRON_SECRET)
 *
 * Original CodeSpectra content only — no scraping copyrighted books.
 * Human publishes from /dashboard/admin/resources.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/cron-heartbeat'
import { withCronWindow } from '@/lib/automation/job-lease'
import { ebooksCol } from '@/lib/db/ebooks'
import { generateEbookDraft, topicForDay } from '@/lib/ebooks-generate'
// topicForDay exported as topicForDay
import { ensureEbookSeed } from '@/lib/ebooks-seed'
import { buildEbookCoverPrompt, generateCoverImage } from '@/lib/ai-image'
import { getEbookSettings } from '@/lib/ebooks-settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

function authorize(req: NextRequest): boolean {
  return isCronAuthorized(req)
}

async function postImpl(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  }

  // AUTO-086: off by default (Admin → Resources → Daily AI draft) — it spends AI budget every day.
  if (!(await getEbookSettings()).auto_draft_enabled) {
    return NextResponse.json({ ok: true, skipped: 'disabled' })
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

// One run per day across replicas and external crons (AUTO-041).
export const POST = withCronWindow('ebooks-daily', 1440, withCronHeartbeat('ebooks-daily', postImpl))

export async function GET(req: NextRequest) {
  return POST(req)
}
