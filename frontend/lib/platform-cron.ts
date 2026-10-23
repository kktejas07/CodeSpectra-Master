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
  /** Slow route (AI passes, scans): the in-process loop starts it in the background lane (AUTO-087). */
  long?: boolean
}

/** Schedules match the catalog on Admin → Cron jobs (app/api/admin/cron-jobs). */
export const SCHEDULED_ROUTES: ScheduledRoute[] = [
  { id: 'status-check', path: '/api/cron/status-check', cron: '*/5 * * * *', intervalMinutes: 5, load: () => import('@/app/api/cron/status-check/route') },
  { id: 'exam-reminders', path: '/api/cron/exam-reminders', cron: '0 * * * *', intervalMinutes: 60, load: () => import('@/app/api/cron/exam-reminders/route') },
  { id: 'daily-digest', path: '/api/cron/daily-digest', cron: '0 8 * * *', intervalMinutes: 1440, load: () => import('@/app/api/cron/daily-digest/route') },
  { id: 'weekly-digest', path: '/api/cron/weekly-digest', cron: '0 9 * * 1', intervalMinutes: 10080, load: () => import('@/app/api/cron/weekly-digest/route') },
  { id: 'ebooks-daily', path: '/api/cron/ebooks-daily', cron: '0 7 * * *', intervalMinutes: 1440, load: () => import('@/app/api/cron/ebooks-daily/route'), long: true },
  { id: 'signals-ingest', path: '/api/cron/signals-ingest', cron: '0 */6 * * *', intervalMinutes: 360, load: () => import('@/app/api/cron/signals-ingest/route'), long: true },
  { id: 'security-scan', path: '/api/cron/security-scan', cron: '0 3 * * 0', intervalMinutes: 10080, load: () => import('@/app/api/cron/security-scan/route'), long: true },
]

/**
 * AUTO-087: how long after its scheduled minute a missed route still runs
 * (restart, deploy or a busy tick at 08:00 no longer loses that day's digest).
 * Half the interval, at most 12 h, so a catch-up never lands near the next run.
 */
export function catchUpMinutes(intervalMinutes: number): number {
  return Math.max(0, Math.min(Math.floor(intervalMinutes / 2), 720))
}

/**
 * Pure: the latest minute <= `minute` (within `lookbackMinutes`) matching `cron`, or null.
 * ponytail: walks back minute by minute (<= 721 isDue calls per route per tick); fine for 7 routes.
 */
export function previousCronSlot(cron: string, minute: Date, lookbackMinutes: number): Date | null {
  const start = new Date(minute)
  start.setUTCSeconds(0, 0)
  for (let i = 0; i <= lookbackMinutes; i++) {
    const t = new Date(start.getTime() - i * 60_000)
    if (isDue(cron, t)) return t
  }
  return null
}

/**
 * Pure: should a scheduled route run at `minute`, given its last successful run?
 * Runs on the scheduled minute OR the first tick after it (within catchUpMinutes),
 * unless it already succeeded for that slot (or an external cron ran it shortly before).
 */
export function scheduledRouteDue(r: Pick<ScheduledRoute, 'cron' | 'intervalMinutes'>, minute: Date, lastOkAt: string | null | undefined): boolean {
  return scheduledRouteSlot(r, minute, lastOkAt) !== null
}

/** The slot to run now (its minute, used as the claim window), or null. */
export function scheduledRouteSlot(r: Pick<ScheduledRoute, 'cron' | 'intervalMinutes'>, minute: Date, lastOkAt: string | null | undefined): Date | null {
  const slot = previousCronSlot(r.cron, minute, catchUpMinutes(r.intervalMinutes))
  if (!slot) return null
  if (!lastOkAt) return slot
  const since = slot.getTime() - new Date(lastOkAt).getTime()
  return since >= r.intervalMinutes * 60_000 * 0.8 ? slot : null
}

export interface PlatformCronReport {
  ran: string[]
  skipped: string[]
  failed: string[]
  autoClosedExams: number
  deferredNotificationsSent: number
  /** Long routes started in the background lane (in-process loop only). */
  background?: string[]
}

export async function runPlatformCron(now: Date = new Date(), opts: { longInBackground?: boolean } = {}): Promise<PlatformCronReport> {
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
    // AI spend history: roll finished days of ai_usage into ai_usage_daily (idempotent; backfills on first run).
    await run('ai-usage-rollup', day, async () => {
      const { runAiUsageRollup } = await import('./ai/usage-rollup')
      const r = await runAiUsageRollup(now)
      if (r.days.length) logger.info(`[ai-cost] Rolled up ${r.days.length} day(s), ${r.groups} group(s)`)
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
    // CORE-041: LMS (LTI) scores whose post failed, re-sent with backoff.
    await run('lti-grade-retry', intervalWindow(minute, 5), async () => {
      const { retryFailedGrades } = await import('./integrations/lti/service')
      const r = await retryFailedGrades(now)
      if (r.sent || r.failed) logger.info(`[lti] Grade retry: ${r.sent} sent, ${r.failed} still failing`)
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

  // ── Agent loops (lib/agent-loops): each checks its switch + schedule and claims its window (every 5 min) ──
  if (minute.getUTCMinutes() % 5 === 0) {
    const merge = (r: { ran: string[]; skipped: string[]; failed: string[] }) => { report.ran.push(...r.ran); report.failed.push(...r.failed) }
    const loops = import('./agent-loops/runner').then((m) => m.runDueAgentLoops(now))
    // Link checks, the sandbox and AI make these slow: background lane when the in-process loop allows it.
    if (opts.longInBackground) { (report.background ||= []).push('agent-loops'); void loops.catch((e) => console.error('[platform-cron] agent loops:', (e as Error)?.message)) }
    else merge(await loops.catch(() => ({ ran: [], skipped: [], failed: ['agent-loops'] })))
  }

  // ── HTTP cron routes on their schedules ──────────────────────────────────
  if (process.env.PLATFORM_CRON_IN_PROCESS !== '0') {
    // AUTO-087: a route is due on its cron minute or the first tick after it (catch-up window),
    // claimed per scheduled slot so a missed 08:00 digest still goes out once.
    const candidates = SCHEDULED_ROUTES.filter((r) => previousCronSlot(r.cron, minute, catchUpMinutes(r.intervalMinutes)))
    if (candidates.length) {
      const last = await getCronRuns(candidates.map((r) => r.id))
      for (const r of candidates) {
        const row = last[r.id]
        // A partial run (time budget reached, e.g. weekly digest) is ok but unfinished: continue it in the catch-up window.
        const lastOk = row && row.last_status === 'ok' && !row.last_partial ? row.last_run_at : null
        const slot = scheduledRouteSlot(r, minute, lastOk)
        if (!slot) { report.skipped.push(r.id); continue }
        const slotKey = slot.toISOString().slice(0, 16)
        if (!(await lock(`codespectra:lock:cron-route:${r.id}:${slotKey}`, Math.min(3600, r.intervalMinutes * 60)))) { report.skipped.push(r.id); continue }
        // One in-process call per scheduled slot across replicas (the routes that need it also
        // claim their window themselves, which covers an external cron hitting them too).
        const { claimJobWindow, finishJobWindow } = await import('./automation/job-lease')
        const leaseMs = r.long ? 30 * 60_000 : 10 * 60_000
        if (!(await claimJobWindow(`inproc-route:${r.id}`, slotKey, now, { leaseMs, maxAttempts: 4 }).catch(() => false))) { report.skipped.push(r.id); continue }
        // A failed / partial run (e.g. the weekly digest's time budget ran out) is retried in the catch-up window.
        const finish = (ok: boolean, err?: string) => finishJobWindow(`inproc-route:${r.id}`, slotKey, ok, err, { retryAfterMs: 5 * 60_000 })
        const call = async (): Promise<boolean> => {
          const mod = await r.load()
          if (!mod.POST) return false
          const { NextRequest } = await import('next/server')
          const { internalCronToken } = await import('./cron-auth')
          const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
          const req = new NextRequest(new URL(r.path, base), { method: 'POST', headers: { authorization: `Bearer ${internalCronToken()}` } })
          // The route's own withCronHeartbeat records the run.
          const res = await mod.POST(req as never)
          // Partial: release the slot claim for a retry (lease bookkeeping only; the heartbeat stays ok).
          await finish(res.status < 400 && res.headers.get('x-cron-partial') !== '1', res.status < 400 ? 'partial' : `HTTP ${res.status}`)
          return res.status < 400
        }
        if (r.long && opts.longInBackground) {
          // Slow routes (AI passes, scans) must not hold up the next minute's critical lane.
          ;(report.background ||= []).push(r.id)
          void call().catch(async (e) => { await finish(false, (e as Error)?.message); console.error(`[platform-cron] ${r.id} error:`, e) })
          continue
        }
        try {
          ;((await call()) ? report.ran : report.failed).push(r.id)
        } catch (e) {
          await finish(false, (e as Error)?.message)
          report.failed.push(r.id)
          console.error(`[platform-cron] ${r.id} error:`, e)
        }
      }
    }
  }
  return report
}
