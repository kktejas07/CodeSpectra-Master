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
import { executeWorkflow } from './workflow-engine'
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

      const started = nowIso()
      let result
      try {
        result = await executeWorkflow(wf)
      } catch (e) {
        result = {
          status: 'failed' as const,
          steps: [
            {
              node_id: 'scheduler',
              label: 'scheduler',
              ok: false,
              error: e instanceof Error ? e.message : String(e),
              duration_ms: 0,
            },
          ],
          duration_ms: 0,
        }
      }
      const finished = nowIso()
      const runId = newId()
      await runsCol.insertOne({
        id: runId,
        workflow_id: wf.id,
        user_id: 'scheduler',
        status: result.status,
        started_at: started,
        finished_at: finished,
        steps: result.steps,
        duration_ms: result.duration_ms,
        // Extra field used for idempotency — not in the WorkflowRunDoc type
        // but Mongo is happy storing extras.
        cron_minute_key: minuteKey,
      } as never)
      triggered.push({
        workflowId: wf.id,
        name: wf.name,
        runId,
        status: result.status,
        duration_ms: result.duration_ms,
      })
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
    // ATS interviews: 24h / 1h reminders + scorecard deadlines (idempotent per interview).
    try {
      const { runInterviewSweep } = await import('./ats/interviews/service')
      await runInterviewSweep()
    } catch (e) {
      console.error('[scheduler] ats interview sweep error:', e)
    }
    // ATS HR round: compensation-form reminders (half-way) + overdue flags (atomic claims per form).
    try {
      const { sweepHrForms } = await import('./ats/hr/service')
      await sweepHrForms()
    } catch (e) {
      console.error('[scheduler] ats hr sweep error:', e)
    }
    // ATS background verification: reminders, deadlines, simulated vendor, adverse-action
    // wait-over notices, retention purge. One replica per 5-minute window.
    const bgvLock = `codespectra:lock:ats-bgv:${new Date().toISOString().slice(0, 15)}${Math.floor(new Date().getUTCMinutes() % 10 / 5)}`
    if (await acquireRedisLock(bgvLock, 280).catch(() => false)) {
      try {
        const { runBgvSweep } = await import('./ats/bgv/service')
        await runBgvSweep()
      } catch (e) {
        console.error('[scheduler] ats bgv sweep error:', e)
      }
    }
    // ATS bot screening: quiet-hour starts, reminders, timeouts, retries. One replica per minute.
    const screenStarted = Date.now()
    const screenLock = `codespectra:lock:ats-screening:${new Date().toISOString().slice(0, 16)}`
    if (await acquireRedisLock(screenLock, 55).catch(() => false)) {
      try {
        const { tickScreening } = await import('./ats/screening/machine')
        await tickScreening(new Date(), 200)
        await recordCronRun('ats-screening', true, Date.now() - screenStarted)
      } catch (e) {
        await recordCronRun('ats-screening', false, Date.now() - screenStarted, e instanceof Error ? e.message : String(e))
        console.error('[scheduler] ats screening tick error:', e)
      }
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
let _trialTimer: ReturnType<typeof setInterval> | null = null

export function startTrialExpiryLoop(): void {
  if (_trialTimer || process.env.NEXT_PUBLIC_DISABLE_SCHEDULER === '1') return
  setTimeout(() => {
    checkTrials()
    _trialTimer = setInterval(checkTrials, 24 * 60 * 60_000)
  }, 60_000)
}

async function checkTrials(): Promise<void> {
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
  // Hiring pipeline (lib/ats): stage SLAs + assessment deadlines. One replica per day.
  const atsStarted = Date.now()
  const atsLock = `codespectra:lock:ats-sla:${new Date().toISOString().slice(0, 10)}`
  if (await acquireRedisLock(atsLock, 6 * 3600).catch(() => false)) {
    try {
      const { sweepSla } = await import('./ats/engine')
      const { sweepAssessmentDeadlines } = await import('./ats/handlers/assessment')
      const late = await sweepAssessmentDeadlines()
      const sla = await sweepSla()
      if (late || sla.rejected) logger.info(`[ats] ${late} assessment deadline(s) missed, ${sla.rejected} SLA rejection(s)`)
      await recordCronRun('ats-sla', true, Date.now() - atsStarted)
    } catch (e) {
      await recordCronRun('ats-sla', false, Date.now() - atsStarted, e instanceof Error ? e.message : String(e))
    }
  }
}
