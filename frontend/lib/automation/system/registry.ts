/**
 * Built-in system automations: registry + the per-minute tick.
 *
 * `runAutomationTick(now)` is called from lib/scheduler.ts runAtsMinuteSweeps
 * (so both the in-process loop and /api/cron/tick run it). Each pass:
 *   1. dispatches pending / retrying events (outbox),
 *   2. resumes waiting workflow runs,
 *   3. runs due persisted jobs (auto-grade, follow-ups, timers),
 *   4. runs each enabled system automation whose window is due — one replica
 *      per window via a DB lease (lib/automation/job-lease.ts, works without
 *      Redis), with a cron_runs heartbeat (`auto:<id>`). A failed daily or
 *      weekly run is retried inside its window (AUTO-032).
 * Event handlers and job handlers record the same heartbeat (AUTO-036), so
 * event-only automations show their last run too.
 * Never throws.
 */
import { recordCronRun } from '@/lib/cron-heartbeat'
import { acquireRedisLock } from '@/lib/upstash-rate-limit'
import { registerJobHandler, runDueJobs, type JobHandler } from '../jobs'
import { col, nowIso } from '../store'
import { isAutomationEnabled } from '../settings'
import { runLeasedJob } from '../job-lease'
import { windowKeyFor } from './rules'
import type { SystemAutomation } from './types'
import type { AutomationEventDoc } from '../events'
import { ASSESSMENT_AUTOMATIONS } from './assessments'
import { BILLING_AUTOMATIONS } from './billing'
import { HIRING_AUTOMATIONS } from './hiring'
import { EVENT_AUTOMATIONS } from './events'
import { ENGAGEMENT_AUTOMATIONS } from './engagement'
import { OPS_AUTOMATIONS } from './ops'
import { SIGNAL_AUTOMATIONS } from './signals'
import { MARKETPLACE_AUTOMATIONS } from './marketplace'
import { SOCIAL_AUTOMATIONS } from './social'
import { INTEGRATION_AUTOMATIONS } from '@/lib/integrations/automation'
import { LEARNING_NUDGE_AUTOMATIONS } from './nudges-learning'
import { BILLING_NUDGE_AUTOMATIONS } from './nudges-billing'
import { HIRING_NUDGE_AUTOMATIONS } from './nudges-hiring'
import { OPS_NUDGE_AUTOMATIONS } from './nudges-ops'

export const SYSTEM_AUTOMATIONS: readonly SystemAutomation[] = [
  ...SIGNAL_AUTOMATIONS,
  ...ASSESSMENT_AUTOMATIONS,
  ...BILLING_AUTOMATIONS,
  ...HIRING_AUTOMATIONS,
  ...EVENT_AUTOMATIONS,
  ...ENGAGEMENT_AUTOMATIONS,
  ...MARKETPLACE_AUTOMATIONS,
  ...INTEGRATION_AUTOMATIONS,
  ...SOCIAL_AUTOMATIONS,
  ...OPS_AUTOMATIONS,
  // Wave 15 nudges (shared frequency cap: lib/automation/nudges).
  ...LEARNING_NUDGE_AUTOMATIONS,
  ...BILLING_NUDGE_AUTOMATIONS,
  ...HIRING_NUDGE_AUTOMATIONS,
  ...OPS_NUDGE_AUTOMATIONS,
]

/** Wrap a handler so each call records the automation's heartbeat. */
function withHeartbeat<A extends unknown[], R>(automationId: string, fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args: A) => {
    const started = Date.now()
    try {
      const r = await fn(...args)
      await recordCronRun(`auto:${automationId}`, true, Date.now() - started)
      return r
    } catch (e) {
      await recordCronRun(`auto:${automationId}`, false, Date.now() - started, e instanceof Error ? e.message : String(e))
      throw e
    }
  }
}

// Register job handlers once (module load).
for (const a of SYSTEM_AUTOMATIONS) for (const j of a.jobs || []) registerJobHandler(j.type, withHeartbeat(a.id, j.handler) as JobHandler)

export function systemAutomationById(id: string): SystemAutomation | undefined {
  return SYSTEM_AUTOMATIONS.find((a) => a.id === id)
}

export function systemEventHandlers(type: string): { automationId: string; handle: (ev: AutomationEventDoc) => Promise<void> }[] {
  const out: { automationId: string; handle: (ev: AutomationEventDoc) => Promise<void> }[] = []
  for (const a of SYSTEM_AUTOMATIONS) for (const e of a.events || []) if (e.type === type) out.push({ automationId: a.id, handle: withHeartbeat(a.id, e.handle) })
  return out
}

/** Is this automation switched on? Locked ones always are. */
export async function automationOn(a: SystemAutomation): Promise<boolean> {
  if (a.locked) return true
  return isAutomationEnabled(a.id, a.defaultOn !== false)
}

/** Which job types belong to switched-off automations (their jobs wait until switched back on). */
async function enabledJobTypes(): Promise<string[]> {
  const out: string[] = []
  for (const a of SYSTEM_AUTOMATIONS) {
    if (!a.jobs?.length) continue
    if (await automationOn(a)) out.push(...a.jobs.map((j) => j.type))
  }
  return out
}

/** Run the sweep and keep its result for the admin page. Throws on failure. */
async function executeAutomation(a: SystemAutomation, now: Date): Promise<unknown> {
  const result = await a.run!(now)
  await (await col('automation_settings')).updateOne({ key: `window:${a.id}` }, { $set: { key: `window:${a.id}`, last_result: result ?? null, last_finished_at: nowIso() } }, { upsert: true }).catch(() => {})
  return result
}

/** "Run now" from the admin page (no window claim). */
export async function runSystemAutomation(a: SystemAutomation, now: Date): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  if (!a.run) return { ok: true }
  const started = Date.now()
  try {
    const result = await executeAutomation(a, now)
    await recordCronRun(`auto:${a.id}`, true, Date.now() - started)
    return { ok: true, result }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    await recordCronRun(`auto:${a.id}`, false, Date.now() - started, error)
    console.error(`[automation] ${a.id} failed:`, e)
    return { ok: false, error }
  }
}

export interface AutomationTickReport {
  events: number
  runsResumed: number
  jobs: { done: number; retried: number; dead: number }
  ran: string[]
  failed: string[]
  /** Sweeps left for the next minute because the time budget was spent. */
  deferred?: number
}

/** How long one tick may spend starting cadenced sweeps before leaving the rest for the next minute. */
export const SWEEP_BUDGET_MS = 20_000

export async function runAutomationTick(now: Date = new Date()): Promise<AutomationTickReport> {
  const report: AutomationTickReport = { events: 0, runsResumed: 0, jobs: { done: 0, retried: 0, dead: 0 }, ran: [], failed: [] }
  const safe = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn()
    } catch (e) {
      console.error(`[automation] ${label} failed:`, e)
      report.failed.push(label)
      return fallback
    }
  }
  const { processPendingEvents } = await import('../events')
  const { resumeDueRuns } = await import('../runs')
  report.events = await safe('events', () => processPendingEvents(now, 15_000), 0)
  report.runsResumed = await safe('runs', () => resumeDueRuns(now, 15_000), 0)
  report.jobs = await safe('jobs', async () => runDueJobs(now, 25_000, await enabledJobTypes()), report.jobs)

  // Time budget for the cadenced sweeps (AUTO-099): this runs inside the every-minute critical
  // lane, so once it is spent the remaining sweeps wait for the next minute. Their window is
  // still unclaimed then, and the ones that already ran are skipped, so every sweep gets its turn.
  // Sweeps marked `heavy` (content freshness) don't run here at all: see runHeavyAutomationSweeps.
  await runCadencedSweeps(now, 'critical', report, safe)
  return report
}

/**
 * The slow cadenced sweeps (`heavy: true`), called from the scheduler's heavy content lane
 * (lib/scheduler.ts) so link checks and AI notes never delay the every-minute critical jobs.
 */
export async function runHeavyAutomationSweeps(now: Date = new Date()): Promise<AutomationTickReport> {
  const report: AutomationTickReport = { events: 0, runsResumed: 0, jobs: { done: 0, retried: 0, dead: 0 }, ran: [], failed: [] }
  const safe = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn()
    } catch (e) {
      console.error(`[automation] ${label} failed:`, e)
      report.failed.push(label)
      return fallback
    }
  }
  await runCadencedSweeps(now, 'heavy', report, safe)
  return report
}

/** Pure: which lane runs this sweep. */
export const sweepLane = (a: Pick<SystemAutomation, 'heavy'>): 'critical' | 'heavy' => (a.heavy ? 'heavy' : 'critical')

async function runCadencedSweeps(now: Date, lane: 'critical' | 'heavy', report: AutomationTickReport, safe: <T>(label: string, fn: () => Promise<T>, fallback: T) => Promise<T>): Promise<void> {
  const sweepsStarted = Date.now()
  for (const a of SYSTEM_AUTOMATIONS) {
    if (!a.cadence || !a.run) continue
    if (sweepLane(a) !== lane) continue
    if (lane === 'critical' && Date.now() - sweepsStarted > SWEEP_BUDGET_MS) { report.deferred = (report.deferred || 0) + 1; continue }
    const key = windowKeyFor(a.cadence, now)
    if (!key) continue
    if (!(await safe(`toggle:${a.id}`, () => automationOn(a), false))) continue
    // Redis keeps replicas off the database claim; the DB lease is what guarantees one run.
    const locked = await acquireRedisLock(`codespectra:lock:auto:${a.id}:${key}`, 600).catch(() => true)
    if (!locked) continue
    const daily = a.cadence.kind !== 'interval'
    const r = await runLeasedJob(`auto:${a.id}`, key, () => executeAutomation(a, now), {
      now,
      heartbeat: `auto:${a.id}`,
      leaseMs: 20 * 60_000,
      maxAttempts: daily ? 4 : 1,
      retryAfterMs: 10 * 60_000,
    })
    if (!r.ran) continue
    if (r.ok) report.ran.push(a.id)
    else report.failed.push(a.id)
  }
}
