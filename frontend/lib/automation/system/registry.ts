/**
 * Built-in system automations: registry + the per-minute tick.
 *
 * `runAutomationTick(now)` is called from lib/scheduler.ts runAtsMinuteSweeps
 * (so both the in-process loop and /api/cron/tick run it). Each pass:
 *   1. dispatches pending / retrying events (outbox),
 *   2. resumes waiting workflow runs,
 *   3. runs due persisted jobs (auto-grade, follow-ups, timers),
 *   4. runs each enabled system automation whose window is due — one replica
 *      per window (Redis lock + an atomic claim in automation_settings), with
 *      a cron_runs heartbeat (`auto:<id>`) for the admin pages.
 * Never throws.
 */
import { recordCronRun } from '@/lib/cron-heartbeat'
import { acquireRedisLock } from '@/lib/upstash-rate-limit'
import { registerJobHandler, runDueJobs } from '../jobs'
import { col, isDuplicateKeyError, nowIso } from '../store'
import { isAutomationEnabled } from '../settings'
import { windowKeyFor } from './rules'
import type { SystemAutomation } from './types'
import type { AutomationEventDoc } from '../events'
import { ASSESSMENT_AUTOMATIONS } from './assessments'
import { BILLING_AUTOMATIONS } from './billing'
import { HIRING_AUTOMATIONS } from './hiring'
import { EVENT_AUTOMATIONS } from './events'
import { ENGAGEMENT_AUTOMATIONS } from './engagement'
import { OPS_AUTOMATIONS } from './ops'

export const SYSTEM_AUTOMATIONS: readonly SystemAutomation[] = [
  ...ASSESSMENT_AUTOMATIONS,
  ...BILLING_AUTOMATIONS,
  ...HIRING_AUTOMATIONS,
  ...EVENT_AUTOMATIONS,
  ...ENGAGEMENT_AUTOMATIONS,
  ...OPS_AUTOMATIONS,
]

// Register job handlers once (module load).
for (const a of SYSTEM_AUTOMATIONS) for (const j of a.jobs || []) registerJobHandler(j.type, j.handler)

export function systemAutomationById(id: string): SystemAutomation | undefined {
  return SYSTEM_AUTOMATIONS.find((a) => a.id === id)
}

export function systemEventHandlers(type: string): { automationId: string; handle: (ev: AutomationEventDoc) => Promise<void> }[] {
  const out: { automationId: string; handle: (ev: AutomationEventDoc) => Promise<void> }[] = []
  for (const a of SYSTEM_AUTOMATIONS) for (const e of a.events || []) if (e.type === type) out.push({ automationId: a.id, handle: e.handle })
  return out
}

/** Which job types belong to switched-off automations (their jobs wait until switched back on). */
async function enabledJobTypes(): Promise<string[]> {
  const out: string[] = []
  for (const a of SYSTEM_AUTOMATIONS) {
    if (!a.jobs?.length) continue
    if (await isAutomationEnabled(a.id, a.defaultOn !== false)) out.push(...a.jobs.map((j) => j.type))
  }
  return out
}

/** Atomically claim one window for one automation (works without Redis too). */
async function claimWindow(id: string, windowKey: string): Promise<boolean> {
  const c = await col('automation_settings')
  try {
    const r = await c.updateOne(
      { key: `window:${id}`, window: { $ne: windowKey } },
      { $set: { key: `window:${id}`, window: windowKey, started_at: nowIso() } },
      { upsert: true },
    )
    return r.modifiedCount > 0 || r.upsertedCount > 0
  } catch (e) {
    if (isDuplicateKeyError(e)) return false
    throw e
  }
}

export async function runSystemAutomation(a: SystemAutomation, now: Date): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  if (!a.run) return { ok: true }
  const started = Date.now()
  try {
    const result = await a.run(now)
    await recordCronRun(`auto:${a.id}`, true, Date.now() - started)
    await (await col('automation_settings')).updateOne({ key: `window:${a.id}` }, { $set: { last_result: result ?? null, last_finished_at: nowIso() } }, { upsert: true }).catch(() => {})
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
}

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

  for (const a of SYSTEM_AUTOMATIONS) {
    if (!a.cadence || !a.run) continue
    const key = windowKeyFor(a.cadence, now)
    if (!key) continue
    if (!(await safe(`toggle:${a.id}`, () => isAutomationEnabled(a.id, a.defaultOn !== false), false))) continue
    const locked = await acquireRedisLock(`codespectra:lock:auto:${a.id}:${key}`, 600).catch(() => false)
    if (!locked) continue
    if (!(await safe(`claim:${a.id}`, () => claimWindow(a.id, key), false))) continue
    const r = await runSystemAutomation(a, now)
    if (r.ok) report.ran.push(a.id)
    else report.failed.push(a.id)
  }
  return report
}
