/**
 * Cron evaluation + lightweight scheduler runner.
 *
 * `isDue(cronExpression, when)` returns true if a 5-field cron string
 * matches the given Date (UTC). Supported syntax:
 *   - `*`                    : any value
 *   - `n`                    : literal value
 *   - `a-b`                  : inclusive range
 *   - `* / n`                : every n-th value
 *   - `a-b/n`                : every n-th in range
 *   - `a,b,c`                : list (any of)
 * Day-of-week 7 is treated as 0 (Sunday) per Unix cron conventions.
 *
 * `runDueWorkflows(when)` queries MongoDB for active schedule-trigger
 * workflows whose cron expression is due *at the minute* of `when`, and
 * executes each via the existing engine. Returns a per-workflow log.
 */
import { recordCronRun } from './cron-heartbeat'
import { logger } from './logger'
import {
  workflows,
  workflowRuns,
  newId,
  nowIso,
  type WorkflowDoc,
} from './db/leaderboard'
import { acquireRedisLock, releaseRedisLock } from './upstash-rate-limit'

interface ParsedField {
  values: Set<number>
}

function parseField(token: string, min: number, max: number): ParsedField {
  const values = new Set<number>()
  for (const piece of token.split(',')) {
    let p = piece.trim()
    if (!p) continue
    let step = 1
    const slash = p.indexOf('/')
    if (slash >= 0) {
      step = Math.max(1, parseInt(p.slice(slash + 1), 10) || 1)
      p = p.slice(0, slash)
    }
    let lo = min
    let hi = max
    if (p === '*' || p === '') {
      lo = min
      hi = max
    } else if (p.includes('-')) {
      const [a, b] = p.split('-')
      lo = parseInt(a, 10)
      hi = parseInt(b, 10)
    } else {
      lo = parseInt(p, 10)
      hi = lo
    }
    if (Number.isNaN(lo) || Number.isNaN(hi)) continue
    for (let v = lo; v <= hi; v += step) {
      if (v >= min && v <= max) values.add(v)
    }
  }
  return { values }
}

export function isDue(cron: string, when: Date = new Date()): boolean {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return false
  const [minStr, hourStr, domStr, monthStr, dowStr] = parts

  try {
    const minute = parseField(minStr, 0, 59)
    const hour = parseField(hourStr, 0, 23)
    const dom = parseField(domStr, 1, 31)
    const month = parseField(monthStr, 1, 12)
    const dowParsed = parseField(dowStr, 0, 7)
    // Normalize 7 -> 0 so both Unix conventions work.
    if (dowParsed.values.has(7)) {
      dowParsed.values.delete(7)
      dowParsed.values.add(0)
    }

    const m = when.getUTCMinutes()
    const h = when.getUTCHours()
    const d = when.getUTCDate()
    const mo = when.getUTCMonth() + 1
    const dw = when.getUTCDay()

    if (!minute.values.has(m)) return false
    if (!hour.values.has(h)) return false
    if (!month.values.has(mo)) return false

    // Per POSIX cron: if BOTH dom and dow are restricted (not '*'),
    // a row matches if EITHER matches; if only one is restricted, that
    // one must match.
    const domAll = domStr === '*'
    const dowAll = dowStr === '*'
    const domMatch = dom.values.has(d)
    const dowMatch = dowParsed.values.has(dw)
    if (domAll && dowAll) return true
    if (!domAll && !dowAll) return domMatch || dowMatch
    if (!domAll) return domMatch
    return dowMatch
  } catch {
    return false
  }
}

export interface SchedulerTickReport {
  ranAt: string
  evaluated: number
  triggered: Array<{
    workflowId: string
    name: string
    runId: string
    status: 'success' | 'failed' | 'partial'
    duration_ms: number
  }>
}

/**
 * Find active, schedule-trigger workflows due at `when` and execute them.
 *
 * Idempotency: we tag each `workflow_runs` row with `cron_minute_key`
 * (YYYY-MM-DDTHH:MM) and bail out if a row already exists for that
 * workflow + minute. This prevents double-runs when the tick endpoint is
 * called more than once per minute by an over-eager external scheduler.
 */
export async function runDueWorkflows(
  when: Date = new Date(),
): Promise<SchedulerTickReport> {
  const wfCol = await workflows()
  const runsCol = await workflowRuns()
  // Round down to the minute for the idempotency key.
  const tickMinute = new Date(when)
  tickMinute.setUTCSeconds(0, 0)
  const minuteKey = tickMinute.toISOString().slice(0, 16) // YYYY-MM-DDTHH:MM

  // Distributed lock: only one replica runs the tick for this minute when
  // Redis is configured. The lock TTL is 5 minutes (longer than the 60s tick)
  // so a slow workflow tick can't be double-run by a sibling replica.
  const lockKey = `codespectra:lock:scheduler:${minuteKey}`
  const lockHeld = await acquireRedisLock(lockKey, 300)
  if (!lockHeld) {
    return { ranAt: tickMinute.toISOString(), evaluated: 0, triggered: [] }
  }
  try {
    const active = (await wfCol
      .find({ trigger: 'schedule', is_active: true })
      .toArray()) as WorkflowDoc[]

    const triggered: SchedulerTickReport['triggered'] = []

    for (const wf of active) {
      if (!wf.cron_expression || !isDue(wf.cron_expression, tickMinute)) continue

      // Skip if already fired this minute.
      const dup = await runsCol.findOne({
        workflow_id: wf.id,
        cron_minute_key: minuteKey,
      })
      if (dup) continue

      // Saved, resumable run (lib/automation/runs.ts): waits, retries and
      // dead-lettering work for scheduled workflows too. The idempotency key
      // makes a second tick in the same minute a no-op.
      let runId = newId()
      let status: SchedulerTickReport['triggered'][number]['status'] = 'failed'
      let duration = 0
      try {
        const { startWorkflowRun } = await import('./automation/runs')
        const { run } = await startWorkflowRun(wf, { trigger: 'schedule', actorId: 'scheduler', idempotencyKey: `cron:${wf.id}:${minuteKey}`, cronMinuteKey: minuteKey })
        runId = run.id
        status = run.status === 'success' || run.status === 'partial' || run.status === 'failed' ? run.status : 'success'
        duration = run.duration_ms || 0
      } catch (e) {
        await runsCol.insertOne({
          id: runId, workflow_id: wf.id, user_id: 'scheduler', status: 'failed', started_at: nowIso(), finished_at: nowIso(),
          steps: [{ node_id: 'scheduler', label: 'scheduler', ok: false, error: e instanceof Error ? e.message : String(e), duration_ms: 0 }],
          duration_ms: 0, cron_minute_key: minuteKey,
        } as never)
      }
      triggered.push({ workflowId: wf.id, name: wf.name, runId, status, duration_ms: duration })
    }

    return {
      ranAt: tickMinute.toISOString(),
      evaluated: active.length,
      triggered,
    }
  } finally {
    await releaseRedisLock(lockKey)
  }
}

// -----------------------------------------------------------------------------
// In-process tick loop (best-effort) for `next dev` / single-instance deploys.
// -----------------------------------------------------------------------------

let _timer: ReturnType<typeof setInterval> | null = null
let _bootstrapped = false

function alignFirstTickMs(): number {
  // Wait until the next :00 second.
  const now = new Date()
  return Math.max(500, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()))
}

export function startSchedulerLoop(): void {
  if (_bootstrapped || _timer) return
  if (process.env.NEXT_PUBLIC_DISABLE_SCHEDULER === '1') return
  _bootstrapped = true

  // AUTO-040: a tick never overlaps the previous one (slow Postal / AI no longer piles ticks up).
  let running = false
  const tick = async () => {
    if (running) {
      console.warn('[scheduler] previous tick still running — this minute is skipped')
      return
    }
    running = true
    const started = Date.now()
    try {
      try {
        await runDueWorkflows()
        await recordCronRun('scheduler-loop', true, Date.now() - started)
      } catch (e) {
        await recordCronRun('scheduler-loop', false, Date.now() - started, e instanceof Error ? e.message : String(e))
        console.error('[scheduler] tick error:', e)
      }
      // Automations, platform jobs and hiring sweeps first; heavy content jobs (events-feed pull,
      // Learn AI drafts and digests) run in their own background lane.
      await runAtsMinuteSweeps(new Date(), { heavyInBackground: true })
      // Knowledge index queue + nightly sweep (lib/rag/ingest.ts). Never throws.
      try {
        const { runKnowledgeTick } = await import('./rag/ingest')
        await runKnowledgeTick()
      } catch (e) {
        console.error('[scheduler] knowledge tick error:', e)
      }
    } finally {
      running = false
    }
  }

  setTimeout(() => {
    void tick()
    _timer = setInterval(() => {
      void tick()
    }, 60_000)
  }, alignFirstTickMs())
}

export function stopSchedulerLoop(): void {
  if (_timer) {
    clearInterval(_timer)
    _timer = null
  }
  _bootstrapped = false
}

// ── Trial expiry check (runs daily) ─────────────────────────────────────────
// Trial + grace expiry now run in the shared runner's daily block
// (lib/platform-cron.ts via runAtsMinuteSweeps), so serverless hosts get them
// from /api/cron/tick too (A-020). Kept as a no-op for existing callers.
export function startTrialExpiryLoop(): void {
  return
}

/** @deprecated kept for manual runs; the shared runner calls the same functions. */
export async function checkTrials(): Promise<void> {
  const started = Date.now()
  try {
    const { expireTrials } = await import('./coupon-service')
    const count = await expireTrials()
    if (count > 0) logger.info(`[trial] Expired ${count} trial subscription(s)`)
    await recordCronRun('trial-expiry', true, Date.now() - started)
  } catch {
    await recordCronRun('trial-expiry', false, Date.now() - started)
  }
  // Same daily pass: end paid plans whose payment-failure grace period has run out.
  const graceStarted = Date.now()
  try {
    const { endLapsedGracePeriods } = await import('./billing-plans')
    const ended = await endLapsedGracePeriods()
    if (ended > 0) logger.info(`[billing] Ended ${ended} subscription(s) after the grace period`)
    await recordCronRun('grace-expiry', true, Date.now() - graceStarted)
  } catch {
    await recordCronRun('grace-expiry', false, Date.now() - graceStarted)
  }
}

// ── Hiring (lib/ats) sweeps ─────────────────────────────────────────────────

export interface AtsSweepReport {
  ran: string[]
  skipped: string[]
  failed: string[]
  /** Started in the background lane (in-process loop only). */
  background?: string[]
  /** Platform jobs (lib/platform-cron.ts): quiet-hours flush, exam auto-close, daily billing, scheduled cron routes. */
  platform?: import('./platform-cron').PlatformCronReport
}

/**
 * Every per-minute background job, in one place. Called by the in-process loop
 * (startSchedulerLoop) AND by /api/cron/tick, so serverless hosts get the same
 * work. Never throws.
 *
 * Each job claims its window (minute / 5 minutes / day) in the database
 * (lib/automation/job-lease.ts) — one replica runs it even without Redis or
 * while Redis fails open (AUTO-041) — records a heartbeat (AUTO-042), and
 * never overlaps itself in a process. A failed daily window is retried.
 *
 * Order (AUTO-040): automations (event outbox, email retries, reminders) and
 * platform-minute jobs (quiet-hours flush, exam auto-close) first, then the
 * hiring / marketplace sweeps, then the heavy content lane (events-feed pull
 * with AI summaries, Learn drafts and digests). The in-process loop runs the
 * heavy lane in the background so it can't hold up the next minute.
 */
export async function runAtsMinuteSweeps(now: Date = new Date(), opts: { heavyInBackground?: boolean } = {}): Promise<AtsSweepReport> {
  const report: AtsSweepReport = { ran: [], skipped: [], failed: [] }
  const iso = now.toISOString()
  const { runLeasedJob, minuteWindow, dayWindow } = await import('./automation/job-lease')
  const minute = minuteWindow(now)
  const fiveMin = `${iso.slice(0, 15)}${Math.floor((now.getUTCMinutes() % 10) / 5)}`
  const job = async (name: string, window: string, fn: () => Promise<unknown>, lease: { maxAttempts?: number; leaseMs?: number; retryAfterMs?: number } = {}) => {
    // Redis (when configured) keeps replicas off the database claim for per-minute jobs;
    // the DB lease is what guarantees a single run.
    if (window === minute && !(await acquireRedisLock(`codespectra:lock:${name}:${minute}`, 55).catch(() => true))) {
      report.skipped.push(name)
      return
    }
    const r = await runLeasedJob(name, window, fn, { now, ...lease })
    if (!r.ran) report.skipped.push(name)
    else (r.ok ? report.ran : report.failed).push(name)
  }

  // ── Critical lane ─────────────────────────────────────────────────────────
  // Automations (lib/automation): event outbox dispatch, email retries, waiting workflow runs,
  // persisted jobs/timers and the built-in system automations (Admin → Automations).
  await job('automations', minute, async () => (await import('./automation/system/registry')).runAutomationTick(now), { leaseMs: 5 * 60_000 })
  // Platform jobs (quiet-hours flush, exam auto-close, trial/grace expiry,
  // digests + other scheduled cron routes) — lib/platform-cron.ts. Own claims.
  try {
    report.platform = await (await import('./platform-cron')).runPlatformCron(now)
  } catch (e) {
    report.failed.push('platform')
    console.error('[scheduler] platform cron error:', e)
  }

  // ── Hiring + marketplace ──────────────────────────────────────────────────
  // Interviews (24h / 1h reminders + scorecard deadlines) and HR compensation forms.
  await job('ats-interviews', minute, async () => (await import('./ats/interviews/service')).runInterviewSweep(now))
  await job('ats-hr-forms', minute, async () => (await import('./ats/hr/service')).sweepHrForms(now))
  // Background verification: reminders, deadlines, simulated vendor, adverse-action notices, retention purge.
  await job('ats-bgv', fiveMin, async () => (await import('./ats/bgv/service')).runBgvSweep(now))
  // Bot screening: quiet-hour starts, reminders, timeouts, retries.
  await job('ats-screening', minute, async () => (await import('./ats/screening/machine')).tickScreening(now, 200))
  // Marketplace (buyer part): release unpaid checkouts after 30 min and send booking reminders.
  await job('mkt-buyer', minute, async () => (await import('./marketplace/settle')).runBuyerSweep(now))
  // Bulk assessment invites (lib/services/bulk-invites.ts): send queued invite e-mails
  // left over from a request (rows are claimed atomically).
  await job('assessment-invites', minute, async () => {
    const { getMongoDb } = await import('./mongodb')
    await (await import('./services/bulk-invites')).sendQueuedInvites(await getMongoDb(), { limit: 200, budgetMs: 40_000, now })
  })
  // Stage SLAs + assessment deadlines. Once per UTC day (retried if it fails).
  await job('ats-sla', dayWindow(now), async () => {
    const { sweepSla } = await import('./ats/engine')
    const { sweepAssessmentDeadlines } = await import('./ats/handlers/assessment')
    const late = await sweepAssessmentDeadlines(now)
    const sla = await sweepSla(now)
    if (late || sla.rejected) logger.info(`[ats] ${late} assessment deadline(s) missed, ${sla.rejected} SLA rejection(s)`)
  }, { maxAttempts: 4, retryAfterMs: 10 * 60_000, leaseMs: 30 * 60_000 })

  // ── Heavy content lane ────────────────────────────────────────────────────
  const heavy = async () => {
    // Learn hub (lib/learn/generate.ts): publish due posts; drafts until today's quota; weekly digest.
    await job('learn', minute, async () => (await import('./learn/generate')).runLearnTick(now), { leaseMs: 10 * 60_000 })
    // Events feed (lib/events-feed/tick.ts): source pulls, WhatsApp alerts + reminders, weekly digest.
    await job('events-feed', minute, async () => (await import('./events-feed/tick')).tickEventsFeed(now), { leaseMs: 10 * 60_000 })
    // Tech news (lib/signals/digest.ts): daily digest to opted-in 'news' subscribers at the configured local hour.
    const nd = await import('./signals/digest')
    const newsDay = await nd.newsDigestDue(now).catch(() => null)
    if (newsDay) await job('news-digest', newsDay, async () => nd.runNewsDigest(now, newsDay), { maxAttempts: 3, retryAfterMs: 10 * 60_000, leaseMs: 20 * 60_000 })
    // Analytics (lib/analytics/rollup.ts): mirror the automation outbox into analytics events,
    // rebuild today's / yesterday's daily rollups, backfill missing days. Once per 15 minutes.
    await job('analytics', `${iso.slice(0, 13)}q${Math.floor(now.getUTCMinutes() / 15)}`, async () => (await import('./analytics/rollup')).runAnalyticsTick(now), { leaseMs: 10 * 60_000 })
    // SEO (lib/seo/indexnow.ts): submit public URLs changed since the last successful
    // submit to IndexNow. No-op until enabled in Admin → Settings → SEO. Once per 10 minutes.
    await job('seo-indexnow', `${iso.slice(0, 15)}x`, async () => (await import('./seo/indexnow')).runIndexNowSweep(now), { leaseMs: 5 * 60_000 })
    // Question bank bot (lib/question-bot/run.ts): nightly gap-filling drafts within the daily +
    // monthly AI caps. Off until enabled in Admin → Question bot; once per UTC day from its run hour.
    const qb = await import('./question-bot/run')
    if (await qb.questionBotDue(now).catch(() => false)) {
      await job('question-bot', dayWindow(now), async () => qb.runQuestionBot({ trigger: 'cron', now }), { maxAttempts: 2, retryAfterMs: 30 * 60_000, leaseMs: 30 * 60_000 })
    }
  }
  if (opts.heavyInBackground) {
    report.background = ['learn', 'events-feed', 'news-digest', 'analytics', 'seo-indexnow', 'question-bot']
    void heavy().catch((e) => console.error('[scheduler] content lane error:', e))
  } else {
    await heavy()
  }

  return report
}
