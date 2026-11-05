/**
 * POST /api/admin/blog/auto-draft
 * Body: { topic, category } → auto-generate a complete blog draft
 *
 * Pipeline:
 * 1. Rewrite title (unique, no DMCA)
 * 2. Search web for latest news
 * 3. Scrape full articles
 * 4. Extract facts
 * 5. Write unique post with attribution
 * 6. Save as draft
 *
 * Core logic lives in lib/admin/blog/auto-draft-service.ts (shared with the
 * signals-ingest cron so it can trigger drafts without auth-gating).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { runAutoDraft } from '@/lib/admin/blog/auto-draft-service'
import type { BlogCategoryId } from '@/lib/blog-categories'

export const runtime = 'nodejs'
export const maxDuration = 180

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const body = (await req.json().catch(() => ({}))) as { topic?: string; category?: string }
  if (!body.topic) {
    return NextResponse.json({ error: 'Topic required' }, { status: 400 })
  }

  const category = (body.category || 'signals') as BlogCategoryId
  const result = await runAutoDraft(body.topic.trim(), category)

  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'Auto-draft failed. Try again.' }, { status: 502 })
  }
  return NextResponse.json(result)
}
