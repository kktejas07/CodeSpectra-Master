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

  const tick = async () => {
    const started = Date.now()
    try {
      await runDueWorkflows()
      await recordCronRun('scheduler-loop', true, Date.now() - started)
    } catch (e) {
      await recordCronRun('scheduler-loop', false, Date.now() - started, e instanceof Error ? e.message : String(e))
      console.error('[scheduler] tick error:', e)
    }
    // Knowledge index queue + nightly sweep (lib/rag/ingest.ts). Never throws.
    try {
      const { runKnowledgeTick } = await import('./rag/ingest')
      await runKnowledgeTick()
    } catch (e) {
      console.error('[scheduler] knowledge tick error:', e)
    }
    // Hiring (lib/ats) sweeps — shared with /api/cron/tick for serverless hosts.
    await runAtsMinuteSweeps()
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
  /** Platform jobs (lib/platform-cron.ts): quiet-hours flush, exam auto-close, daily billing, scheduled cron routes. */
  platform?: import('./platform-cron').PlatformCronReport
}

let _lastAtsDailyKey = ''

/**
 * Every per-minute hiring job, in one place. Called by the in-process loop
 * (startSchedulerLoop) AND by /api/cron/tick, so serverless hosts get the same
 * work. Each job takes a Redis lock keyed by its window (minute / 5 minutes /
 * day), so a loop and an external cron hitting the same window never both run
 * it. Without Redis the locks always succeed; every job is idempotent (atomic
 * claims / status guards), and the daily pass also has an in-process guard.
 * Never throws.
 */
export async function runAtsMinuteSweeps(now: Date = new Date()): Promise<AtsSweepReport> {
  const report: AtsSweepReport = { ran: [], skipped: [], failed: [] }
  const iso = now.toISOString()
  const lock = (key: string, ttl: number) => acquireRedisLock(key, ttl).catch(() => false)
  const run = async (name: string, fn: () => Promise<unknown>, heartbeat = false) => {
    const started = Date.now()
    try {
      await fn()
      report.ran.push(name)
      if (heartbeat) await recordCronRun(name, true, Date.now() - started)
    } catch (e) {
      report.failed.push(name)
      if (heartbeat) await recordCronRun(name, false, Date.now() - started, e instanceof Error ? e.message : String(e))
      console.error(`[scheduler] ${name} error:`, e)
    }
  }

  // Interviews (24h / 1h reminders + scorecard deadlines) and HR compensation forms
  // (half-way reminders + overdue flags). One replica per minute.
  if (await lock(`codespectra:lock:ats-minute:${iso.slice(0, 16)}`, 55)) {
    await run('ats-interviews', async () => (await import('./ats/interviews/service')).runInterviewSweep(now))
    await run('ats-hr-forms', async () => (await import('./ats/hr/service')).sweepHrForms(now))
  } else report.skipped.push('ats-interviews', 'ats-hr-forms')

  // Background verification: reminders, deadlines, simulated vendor, adverse-action
  // notices, retention purge. One replica per 5-minute window.
  const bgvLock = `codespectra:lock:ats-bgv:${iso.slice(0, 15)}${Math.floor(now.getUTCMinutes() % 10 / 5)}`
  if (await lock(bgvLock, 280)) {
    await run('ats-bgv', async () => (await import('./ats/bgv/service')).runBgvSweep(now))
  } else report.skipped.push('ats-bgv')

  // Bot screening: quiet-hour starts, reminders, timeouts, retries. One replica per minute.
  if (await lock(`codespectra:lock:ats-screening:${iso.slice(0, 16)}`, 55)) {
    await run('ats-screening', async () => (await import('./ats/screening/machine')).tickScreening(now, 200), true)
  } else report.skipped.push('ats-screening')

  // Marketplace (buyer part): release unpaid checkouts after 30 min (re-checking the gateway first)
  // and send booking reminders. One replica per minute; every step is idempotent.
  if (await lock(`codespectra:lock:mkt-buyer:${iso.slice(0, 16)}`, 55)) {
    await run('mkt-buyer', async () => (await import('./marketplace/settle')).runBuyerSweep(now), true)
  } else report.skipped.push('mkt-buyer')

  // Stage SLAs + assessment deadlines. Once per UTC day, one replica.
  const day = iso.slice(0, 10)
  if (_lastAtsDailyKey !== day && (await lock(`codespectra:lock:ats-sla:${day}`, 6 * 3600))) {
    _lastAtsDailyKey = day
    await run('ats-sla', async () => {
      const { sweepSla } = await import('./ats/engine')
      const { sweepAssessmentDeadlines } = await import('./ats/handlers/assessment')
      const late = await sweepAssessmentDeadlines(now)
      const sla = await sweepSla(now)
      if (late || sla.rejected) logger.info(`[ats] ${late} assessment deadline(s) missed, ${sla.rejected} SLA rejection(s)`)
    }, true)
  } else report.skipped.push('ats-sla')

  // Learn hub (lib/learn/generate.ts): publish due scheduled posts; from the set
  // hour, write one draft per tick until today's quota (atomic slot claim). One replica per minute.
  if (await lock(`codespectra:lock:learn:${iso.slice(0, 16)}`, 55)) {
    await run('learn', async () => (await import('./learn/generate')).runLearnTick(now))
  } else report.skipped.push('learn')

  // Events feed (lib/events-feed/tick.ts): source pulls (every N h), WhatsApp alerts +
  // deadline reminders (every 15 min), weekly digest. Each job claims its run marker
  // atomically in events_feed_settings. One replica per minute.
  if (await lock(`codespectra:lock:events-feed:${iso.slice(0, 16)}`, 55)) {
    await run('events-feed', async () => (await import('./events-feed/tick')).tickEventsFeed(now))
  } else report.skipped.push('events-feed')

  // Automations (lib/automation): event outbox dispatch, waiting workflow runs,
  // persisted jobs/timers and the built-in system automations (Admin → Automations).
  // Each automation claims its own window (Redis lock + DB claim) and records
  // an `auto:<id>` heartbeat. One replica per minute.
  if (await lock(`codespectra:lock:automations:${iso.slice(0, 16)}`, 55)) {
    await run('automations', async () => (await import('./automation/system/registry')).runAutomationTick(now), true)
  } else report.skipped.push('automations')

  // Platform jobs (quiet-hours flush, exam auto-close, trial/grace expiry,
  // digests + other scheduled cron routes) — lib/platform-cron.ts. Own locks.
  try {
    report.platform = await (await import('./platform-cron')).runPlatformCron(now)
  } catch (e) {
    report.failed.push('platform')
    console.error('[scheduler] platform cron error:', e)
  }

  return report
}
