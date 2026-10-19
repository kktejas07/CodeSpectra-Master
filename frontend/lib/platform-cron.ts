/**
 * Platform jobs for the shared scheduler runner (audit A-018 / A-019 / A-020 /
 * A-045). Called from runAtsMinuteSweeps in lib/scheduler.ts, which runs from
 * BOTH the in-process loop (Docker / VPS: nothing to configure) and
 * /api/cron/tick (serverless: one external cron every minute). Every job holds
 * a Redis lock for its window, so the loop and the external tick never both
 * run it; without Redis each job is idempotent anyway.
 *
 *   every minute  exam auto-close, quiet-hours notification flush
 *   daily         trial expiry, payment-failure grace expiry, identity-photo
 *                 retention purge (00:05 UTC or the first tick after)
 *   on schedule   the HTTP cron routes (digests, exam reminders, status check,
 *                 security scan, signals ingest, ebook draft) at their cron hints.
 *                 A run is skipped when that route already ran successfully
 *                 within ~80% of its interval (e.g. an external cron still hits
 *                 it), so nothing is sent twice. Set PLATFORM_CRON_IN_PROCESS=0
 *                 to leave those routes to an external scheduler only.
 */
import { isDue } from './scheduler'
import { recordCronRun, getCronRuns } from './cron-heartbeat'
import { acquireRedisLock } from './upstash-rate-limit'
import { logger } from './logger'

export interface ScheduledRoute {
  id: string
  path: string
  cron: string
  intervalMinutes: number
  load: () => Promise<{ POST?: (req: never) => Promise<Response> }>
}

/** Schedules match the catalog on Admin → Cron jobs (app/api/admin/cron-jobs). */
export const SCHEDULED_ROUTES: ScheduledRoute[] = [
  { id: 'status-check', path: '/api/cron/status-check', cron: '*/5 * * * *', intervalMinutes: 5, load: () => import('@/app/api/cron/status-check/route') },
  { id: 'exam-reminders', path: '/api/cron/exam-reminders', cron: '0 * * * *', intervalMinutes: 60, load: () => import('@/app/api/cron/exam-reminders/route') },
  { id: 'daily-digest', path: '/api/cron/daily-digest', cron: '0 8 * * *', intervalMinutes: 1440, load: () => import('@/app/api/cron/daily-digest/route') },
  { id: 'weekly-digest', path: '/api/cron/weekly-digest', cron: '0 9 * * 1', intervalMinutes: 10080, load: () => import('@/app/api/cron/weekly-digest/route') },
  { id: 'ebooks-daily', path: '/api/cron/ebooks-daily', cron: '0 7 * * *', intervalMinutes: 1440, load: () => import('@/app/api/cron/ebooks-daily/route') },
  { id: 'signals-ingest', path: '/api/cron/signals-ingest', cron: '0 */6 * * *', intervalMinutes: 360, load: () => import('@/app/api/cron/signals-ingest/route') },
  { id: 'security-scan', path: '/api/cron/security-scan', cron: '0 3 * * 0', intervalMinutes: 10080, load: () => import('@/app/api/cron/security-scan/route') },
]

/** Pure: should a scheduled route run at `minute`, given its last successful run? */
export function scheduledRouteDue(r: Pick<ScheduledRoute, 'cron' | 'intervalMinutes'>, minute: Date, lastOkAt: string | null | undefined): boolean {
  if (!isDue(r.cron, minute)) return false
  if (!lastOkAt) return true
  const since = minute.getTime() - new Date(lastOkAt).getTime()
  return !(since >= 0 && since < r.intervalMinutes * 60_000 * 0.8)
}

export interface PlatformCronReport {
  ran: string[]
  skipped: string[]
  failed: string[]
  autoClosedExams: number
  deferredNotificationsSent: number
}

let _lastDailyKey = ''

export async function runPlatformCron(now: Date = new Date()): Promise<PlatformCronReport> {
  const report: PlatformCronReport = { ran: [], skipped: [], failed: [], autoClosedExams: 0, deferredNotificationsSent: 0 }
  const minute = new Date(now)
  minute.setUTCSeconds(0, 0)
  const iso = minute.toISOString()
  const lock = (key: string, ttl: number) => acquireRedisLock(key, ttl).catch(() => false)
  const run = async (name: string, fn: () => Promise<unknown>) => {
    const started = Date.now()
    try {
      await fn()
      report.ran.push(name)
      await recordCronRun(name, true, Date.now() - started)
    } catch (e) {
      report.failed.push(name)
      await recordCronRun(name, false, Date.now() - started, e instanceof Error ? e.message : String(e))
      console.error(`[platform-cron] ${name} error:`, e)
    }
  }

  // ── every minute ──────────────────────────────────────────────────────────
  if (await lock(`codespectra:lock:platform-minute:${iso.slice(0, 16)}`, 55)) {
    await run('exam-auto-close', async () => {
      // Archive available exams past their submit-by deadline. Idempotent
      // (matches status 'available' only; ISO strings compare lexicographically).
      const { getMongoDb } = await import('./mongodb')
      const db = await getMongoDb()
      const nowIso = new Date().toISOString()
      const r = await db.collection('exams').updateMany(
        { status: 'available', ends_at: { $lt: nowIso } },
        { $set: { status: 'archived', updatedAt: nowIso } },
      )
      report.autoClosedExams = r.modifiedCount || 0
    })
    await run('quiet-hours-flush', async () => {
      // Email/push held back by users' quiet hours, sent once their window ends.
      const { flushDeferredDeliveries } = await import('./notifications-delivery')
      report.deferredNotificationsSent = await flushDeferredDeliveries(now)
    })
  } else report.skipped.push('exam-auto-close', 'quiet-hours-flush')

  // ── daily (trial + grace expiry) ─────────────────────────────────────────
  const day = iso.slice(0, 10)
  const afterWindow = minute.getUTCHours() > 0 || minute.getUTCMinutes() >= 5
  if (afterWindow && _lastDailyKey !== day && (await lock(`codespectra:lock:billing-daily:${day}`, 6 * 3600))) {
    _lastDailyKey = day
    await run('trial-expiry', async () => {
      const { expireTrials } = await import('./coupon-service')
      const count = await expireTrials()
      if (count > 0) logger.info(`[trial] Expired ${count} trial subscription(s)`)
    })
    await run('grace-expiry', async () => {
      const { endLapsedGracePeriods } = await import('./billing-plans')
      const ended = await endLapsedGracePeriods()
      if (ended > 0) logger.info(`[billing] Ended ${ended} subscription(s) after the grace period`)
    })
    await run('identity-media-purge', async () => {
      const { purgeExpiredIdentityMedia } = await import('./identity-media')
      await purgeExpiredIdentityMedia(now)
    })
  }

  // ── HTTP cron routes on their schedules ──────────────────────────────────
  if (process.env.PLATFORM_CRON_IN_PROCESS !== '0') {
    const due = SCHEDULED_ROUTES.filter((r) => isDue(r.cron, minute))
    if (due.length) {
      const last = await getCronRuns(due.map((r) => r.id))
      for (const r of due) {
        const row = last[r.id]
        const lastOk = row && row.last_status === 'ok' ? row.last_run_at : null
        if (!scheduledRouteDue(r, minute, lastOk)) { report.skipped.push(r.id); continue }
        if (!(await lock(`codespectra:lock:cron-route:${r.id}:${iso.slice(0, 16)}`, Math.min(3600, r.intervalMinutes * 60)))) { report.skipped.push(r.id); continue }
        try {
          const mod = await r.load()
          if (!mod.POST) { report.skipped.push(r.id); continue }
          const { NextRequest } = await import('next/server')
          const { internalCronToken } = await import('./cron-auth')
          const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
          const req = new NextRequest(new URL(r.path, base), { method: 'POST', headers: { authorization: `Bearer ${internalCronToken()}` } })
          // The route's own withCronHeartbeat records the run.
          const res = await mod.POST(req as never)
          ;(res.status < 400 ? report.ran : report.failed).push(r.id)
        } catch (e) {
          report.failed.push(r.id)
          console.error(`[platform-cron] ${r.id} error:`, e)
        }
      }
    }
  }
  return report
}
