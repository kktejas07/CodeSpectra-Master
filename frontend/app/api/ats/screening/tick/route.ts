/**
 * POST|GET /api/ats/screening/tick — scheduler entry (Authorization: Bearer <CRON_SECRET>).
 * Runs due screening actions: quiet-hours starts, reminders, timeouts, retries, fallbacks.
 * Point the platform cron at it every 5 minutes.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { tickScreening } from '@/lib/ats/screening/machine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handle(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ ok: true, ...(await tickScreening(new Date(), 200)) })
  } catch (e) {
    console.error('[ats/screening/tick] failed:', e)
    return NextResponse.json({ error: 'Tick failed' }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
