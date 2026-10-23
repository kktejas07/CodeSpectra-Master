/**
 * Scheduler hook for the hiring agents (server only). Called from the heavy
 * lane of lib/scheduler.ts every minute; each loop claims its own window in
 * job_leases (one replica, retried on failure) and records its heartbeat
 * under its job id (lib/automation/job-registry.ts):
 *
 *   hiring-agent-sourcer    hourly check; runs once a UTC day per org from its run hour
 *   hiring-agent-scheduler  hourly
 *   hiring-agent-author     every 15 minutes, orgs with queued requests
 *   hiring-agent-integrity  hourly; orgs with recent integrity reports (on by default)
 *
 * Per organisation, a scheduled run is unique per window (run_key), so a
 * retried window never drafts twice.
 */
import 'server-only'
import { logger } from '@/lib/logger'
import { LOOP_EVERY_MINUTES, LOOP_IDS, LOOP_JOB_ID, loopDue, type LoopId } from './types'
import { enabledTenants, disabledTenants, getLoopSettings, authorRequests } from './store'

async function tenantsFor(loop: LoopId, now: Date): Promise<string[]> {
  if (loop === 'author') {
    const queued = await (await authorRequests()).distinct('tenant_id', { status: { $in: ['queued', 'working'] } })
    const on = new Set(await enabledTenants('author'))
    return (queued as string[]).filter((t) => on.has(t))
  }
  if (loop === 'integrity') {
    const { reportsCol } = await import('@/lib/integrity/store')
    const since = new Date(now.getTime() - 14 * 86_400_000).toISOString()
    const withReports = (await (await reportsCol()).distinct('tenant_id', { status: 'done', finished_at: { $gte: since }, tenant_id: { $type: 'string' } })) as string[]
    const off = await disabledTenants('integrity')
    return [...new Set([...withReports.filter((t) => !off.has(t)), ...(await enabledTenants('integrity'))])]
  }
  return enabledTenants(loop)
}

export async function runHiringLoopsTick(now: Date = new Date()): Promise<void> {
  // Each loop looks at most once per its cadence (aligned windows).
  const { runLeasedJob, intervalWindow } = await import('@/lib/automation/job-lease')
  const { runHiringLoop } = await import('./run')
  for (const loop of LOOP_IDS) {
    const every = loop === 'sourcer' ? 60 : LOOP_EVERY_MINUTES[loop]
    await runLeasedJob(LOOP_JOB_ID[loop], intervalWindow(now, every), async () => {
      const tenants = await tenantsFor(loop, now)
      let ran = 0
      for (const t of tenants.slice(0, 200)) {
        const { settings } = await getLoopSettings(t, loop)
        if (!loopDue(loop, settings, now)) continue
        try {
          const r = await runHiringLoop(loop, t, { trigger: 'cron', now })
          if (r.status !== 'skipped') ran++
        } catch (e) {
          logger.warn(`[hiring-agents] ${loop} tick failed for an organisation: ${(e as Error)?.message?.slice(0, 200)}`)
        }
      }
      return ran
    }, { maxAttempts: 2, retryAfterMs: 10 * 60_000, leaseMs: 30 * 60_000 })
  }
}
