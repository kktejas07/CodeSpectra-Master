/**
 * POST /api/cron/tick      external scheduler entrypoint
 * GET  /api/cron/tick      (alias for cron services that only support GET)
 *
 * Auth: provide either
 *   - `Authorization: Bearer <CRON_SECRET>`  OR
 *   - `?secret=<CRON_SECRET>` query parameter
 *
 * Set `CRON_SECRET` in your environment (or in MongoDB platform_settings)
 * and configure your cron provider (Vercel Cron, GitHub Actions,
 * cron-job.org, etc.) to hit this endpoint every minute.
 *
 * The route is idempotent within the same minute — if it is called more
 * than once per UTC minute, only the first call actually triggers due
 * workflows (see `cron_minute_key` in scheduler.ts).
 *
 * Even without an external cron, an in-process tick loop runs every
 * minute when the Next.js server is alive (see `scheduler.ts:startSchedulerLoop`),
 * so single-instance deployments work out of the box.
 */
import { NextRequest, NextResponse } from 'next/server'
import { withCronHeartbeat } from '@/lib/cron-heartbeat'
import { runDueWorkflows, startSchedulerLoop } from '@/lib/scheduler'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Kick off the in-process loop at module load (no-op after the first call).
startSchedulerLoop()

function authorize(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim()
  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      return false
    }
    return true // dev mode: allow without secret
  }
  const url = new URL(req.url)
  const fromQuery = url.searchParams.get('secret') || ''
  const fromHeader = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  return fromQuery === expected || fromHeader === expected
}

async function handle(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const report = await runDueWorkflows(new Date())
  // Auto-close: flip available exams past their submit-by deadline to
  // archived so stale assessments disappear from lists. Idempotent by
  // construction (only matches status 'available'); ISO strings compare
  // lexicographically, and docs without ends_at never match $lt.
  let autoClosed = 0
  try {
    const db = await getMongoDb()
    const nowIso = new Date().toISOString()
    const r = await db.collection('exams').updateMany(
      { status: 'available', ends_at: { $lt: nowIso } },
      { $set: { status: 'archived', updatedAt: nowIso } },
    )
    autoClosed = r.modifiedCount || 0
  } catch {
    // Never fail the tick over housekeeping.
  }
  return NextResponse.json({ ok: true, ...report, autoClosedExams: autoClosed })
}

const cronTick = withCronHeartbeat('tick', handle)
export const POST = cronTick
export const GET = cronTick
