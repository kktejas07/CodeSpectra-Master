/**
 * POST /api/cron/tick      external scheduler entrypoint
 * GET  /api/cron/tick      (alias for cron services that only support GET)
 *
 * Auth: provide either
 *   - `Authorization: Bearer <CRON_SECRET>` (the `?secret=` query is no longer accepted)
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
 *
 * Hosting:
 *   - Long-running servers (Docker / VPS / Dokploy): nothing to set up — the
 *     in-process loop runs workflows, every hiring sweep and the platform jobs
 *     (lib/platform-cron.ts: quiet-hours flush, exam auto-close, trial/grace
 *     expiry, digests, exam reminders, status check …) each minute.
 *   - Serverless (Vercel, Netlify, …): there is no long-lived process, so add ONE
 *     cron that hits /api/cron/tick every minute with `Authorization: Bearer
 *     <CRON_SECRET>`. It runs the same hiring sweeps as the loop
 *     (`runAtsMinuteSweeps`: interviews, HR forms, background checks, bot
 *     screening, daily SLA + assessment deadlines). Each sweep holds a Redis
 *     lock for its window, so the loop and the cron never both run it.
 *   /api/ats/screening/tick still works for hosts that already point at it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/cron-heartbeat'
import { runAtsMinuteSweeps, runDueWorkflows, startSchedulerLoop } from '@/lib/scheduler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Kick off the in-process loop at module load (no-op after the first call).
startSchedulerLoop()

function authorize(req: NextRequest): boolean {
  return isCronAuthorized(req)
}

async function handle(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const report = await runDueWorkflows(new Date())
  // Shared runner (same function the in-process loop calls; never throws):
  // hiring sweeps + platform jobs — exam auto-close, quiet-hours flush,
  // daily trial/grace expiry, digests and other scheduled cron routes.
  const ats = await runAtsMinuteSweeps(new Date())
  return NextResponse.json({
    ok: true,
    ...report,
    autoClosedExams: ats.platform?.autoClosedExams ?? 0,
    deferredNotificationsSent: ats.platform?.deferredNotificationsSent ?? 0,
    ats,
  })
}

const cronTick = withCronHeartbeat('tick', handle)
export const POST = cronTick
export const GET = cronTick
