/**
 * Platform jobs for the shared scheduler runner (audit A-018 / A-019 / A-020 /
 * A-045). Called from runAtsMinuteSweeps in lib/scheduler.ts, which runs from
 * BOTH the in-process loop (Docker / VPS: nothing to configure) and
 * /api/cron/tick (serverless: one external cron every minute). Every job
 * claims its window in the database (lib/automation/job-lease.ts) — Redis is
 * only a fast path — so N replicas without Redis never double-run a job, and
 * a failed daily run is retried in its window (AUTO-041 / AUTO-032).
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
import { getCronRuns } from './cron-heartbeat'
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

export async function runPlatformCron(now: Date = new Date()): Promise<PlatformCronReport> {
  const report: PlatformCronReport = { ran: [], skipped: [], failed: [], autoClosedExams: 0, deferredNotificationsSent: 0 }
  const minute = new Date(now)
  minute.setUTCSeconds(0, 0)
  const iso = minute.toISOString()
  const lock = (key: string, ttl: number) => acquireRedisLock(key, ttl).catch(() => true)
  const { runLeasedJob, minuteWindow, dayWindow } = await import('./automation/job-lease')
  // Every job claims its window in the database (works without Redis, AUTO-041) and records a heartbeat.
  const run = async (name: string, window: string, fn: () => Promise<unknown>, lease: { maxAttempts?: number; retryAfterMs?: number; leaseMs?: number } = {}) => {
    const r = await runLeasedJob(name, window, fn, { now, ...lease })
    if (!r.ran) report.skipped.push(name)
    else (r.ok ? report.ran : report.failed).push(name)
  }

  // ── every minute ──────────────────────────────────────────────────────────
  if (await lock(`codespectra:lock:platform-minute:${iso.slice(0, 16)}`, 55)) {
    // Quiet-hours deliveries first: they are user-facing and time-sensitive.
    await run('quiet-hours-flush', minuteWindow(minute), async () => {
      // Email/push held back by users' quiet hours, sent once their window ends.
      const { flushDeferredDeliveries } = await import('./notifications-delivery')
      report.deferredNotificationsSent = await flushDeferredDeliveries(now)
    })
    await run('exam-auto-close', minuteWindow(minute), async () => {
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
  } else report.skipped.push('exam-auto-close', 'quiet-hours-flush')

  // ── daily (trial + grace expiry, identity media) — from 00:05 UTC, retried if a run fails ──
  const day = dayWindow(minute)
  const afterWindow = minute.getUTCHours() > 0 || minute.getUTCMinutes() >= 5
  if (afterWindow) {
    const daily = { maxAttempts: 4, retryAfterMs: 10 * 60_000, leaseMs: 30 * 60_000 }
    await run('trial-expiry', day, async () => {
      const { expireTrials } = await import('./coupon-service')
      const count = await expireTrials()
      if (count > 0) logger.info(`[trial] Expired ${count} trial subscription(s)`)
    }, daily)
    await run('grace-expiry', day, async () => {
      const { endLapsedGracePeriods } = await import('./billing-plans')
      const ended = await endLapsedGracePeriods()
      if (ended > 0) logger.info(`[billing] Ended ${ended} subscription(s) after the grace period`)
    }, daily)
    // Monetisation (lib/billing/*): Razorpay cancels near renewal, paid-referral rewards, licence expiry.
    await run('razorpay-cancel-sweep', day, async () => {
      const { sweepRazorpayCancellations } = await import('./billing/razorpay-subscriptions')
      const n = await sweepRazorpayCancellations(now)
      if (n > 0) logger.info(`[billing] Cancelled ${n} Razorpay subscription(s) at period end`)
    }, daily)
    await run('referral-rewards', day, async () => {
      const { processReferralRewards } = await import('./billing/referrals')
      const r = await processReferralRewards(now)
      if (r.granted || r.voided) logger.info(`[billing] Referral rewards: ${r.granted} granted, ${r.voided} void`)
    }, daily)
    await run('licence-expiry', day, async () => {
      const { expireLicences } = await import('./billing/licences')
      await expireLicences(now)
    }, daily)
    await run('identity-media-purge', day, async () => {
      const { purgeExpiredIdentityMedia } = await import('./identity-media')
      await purgeExpiredIdentityMedia(now)
    }, daily)
  }

  // ── weekly company test refresh (off by default: Admin → Company patterns) ──
  // Checked once an hour; the week window is claimed in the database, so it runs once a week.
  if (afterWindow && minute.getUTCMinutes() === 10) {
    const { getCompanyTestSettings } = await import('./company-tests/db')
    if ((await getCompanyTestSettings().catch(() => null))?.refreshEnabled) {
      const { intervalWindow } = await import('./automation/job-lease')
      await run('company-tests-refresh', intervalWindow(minute, 10080), async () => {
        const { runCompanyTestsRefresh } = await import('./company-tests/refresh')
        await runCompanyTestsRefresh(now)
      }, { maxAttempts: 3, retryAfterMs: 60 * 60_000, leaseMs: 60 * 60_000 })
    }
  }

  // ── proctored certifications: finalise graded attempts, settle missed payments, expiry reminders (every 5 min) ──
  if (minute.getUTCMinutes() % 5 === 0) {
    const { intervalWindow } = await import('./automation/job-lease')
    await run('pro-cert-sweep', intervalWindow(minute, 5), async () => {
      const { runProCertSweep } = await import('./pro-certs/service')
      await runProCertSweep(now)
    }, { leaseMs: 5 * 60_000 })
  }

  // ── weekly hiring analytics digest (Mondays from 03:30 UTC = 09:00 IST; week window claimed in the DB) ──
  if (minute.getUTCDay() === 1 && (minute.getUTCHours() > 3 || (minute.getUTCHours() === 3 && minute.getUTCMinutes() >= 30)) && minute.getUTCMinutes() % 15 === 0) {
    const { intervalWindow } = await import('./automation/job-lease')
    await run('hiring-analytics-digest', intervalWindow(minute, 10080), async () => {
      const { sendHiringDigests } = await import('./ats/hiring-insights-server')
      await sendHiringDigests(now)
    }, { maxAttempts: 3, retryAfterMs: 30 * 60_000, leaseMs: 30 * 60_000 })
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
        // One in-process call per scheduled slot across replicas (the routes that need it also
        // claim their window themselves, which covers an external cron hitting them too).
        const { claimJobWindow } = await import('./automation/job-lease')
        if (!(await claimJobWindow(`inproc-route:${r.id}`, iso.slice(0, 16), now).catch(() => false))) { report.skipped.push(r.id); continue }
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
