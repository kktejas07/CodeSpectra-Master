/**
 * Cron: ingest public RSS / Atom → research → fact pack → draft → humanize → signal_drafts.
 * POST /api/cron/signals-ingest  (Authorization: Bearer CRON_SECRET)
 *
 * Never scrapes Unstop/closed sites. Trusted feeds (official vendor / language /
 * advisory blogs) auto-publish to /news; the rest wait for an admin
 * (lib/signals/ingest). AI spend is capped in Admin → Signals → Settings.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/cron-heartbeat'
import { withCronWindow } from '@/lib/automation/job-lease'
import { runSignalsIngest } from '@/lib/signals/ingest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// 3 LLM passes × a few items — allow serverless room
export const maxDuration = 300

async function postImpl(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  }
  const r = await runSignalsIngest()
  return NextResponse.json({ ok: true, ...r })
}

// One run per 6-hour window across replicas and external crons (AUTO-041).
export const POST = withCronWindow('signals-ingest', 360, withCronHeartbeat('signals-ingest', postImpl))

export async function GET(req: NextRequest) {
  return POST(req)
}
