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
import {
  workflows,
  workflowRuns,
  newId,
  nowIso,
  type WorkflowDoc,
} from './db/leaderboard'

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

  setTimeout(() => {
    void runDueWorkflows().catch((e) => console.error('[scheduler] tick error:', e))
    _timer = setInterval(() => {
      void runDueWorkflows().catch((e) => console.error('[scheduler] tick error:', e))
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
