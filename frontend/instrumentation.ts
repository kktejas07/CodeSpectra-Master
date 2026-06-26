/**
 * Next.js boot hook (runs once per server process, before any route handler).
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * We use this slot to start the in-process scheduler tick loop so that
 * single-instance deploys (and `next dev`) trigger schedule-trigger
 * workflows without needing an external cron. The loop is a no-op if
 * `NEXT_PUBLIC_DISABLE_SCHEDULER=1` is set.
 *
 * On serverless deployments (Vercel, etc.) the in-process loop will only
 * run while a node is warm — pair this with the `vercel.json` cron entry,
 * which hits `/api/cron/tick` every minute to guarantee execution.
 */
export async function register() {
  // Only run on the Node.js runtime — Edge can't spawn timers.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  try {
    const { startSchedulerLoop } = await import('./lib/scheduler')
    startSchedulerLoop()
    console.log('[CodeSpectra] scheduler loop booted via instrumentation.register()')
  } catch (e) {
    console.warn('[CodeSpectra] scheduler bootstrap skipped:', e)
  }
}
