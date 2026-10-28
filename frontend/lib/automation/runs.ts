/**
 * Workflow runs: start, resume, re-run from the failed step, dead-letter.
 *
 * A run is a `workflow_runs` doc holding the trigger payload and the
 * replayable step state (lib/automation/engine.ts). Runs that wait (delay
 * step, retry backoff, time budget) are resumed by `resumeDueRuns` from the
 * scheduler; each pass holds a short lease so two replicas never advance the
 * same run at once.
 */
import type { WorkflowDoc, WorkflowRunDoc } from '@/lib/db/leaderboard'
import { getAppOrigin } from '@/lib/app-origin'
import { advance, legacyStepsFrom, resetFailedSteps, type RunState } from './engine'
import { builtinVars, type Ctx } from './interpolate'
import { executeAction } from './actions'
import { col, deadLetter, isDuplicateKeyError, newId, nowIso, sanitizePayload } from './store'

export { sanitizePayload }
import { consumeQuota, QuotaExceededError } from './quotas'
import type { StepDef } from './steps-catalog'

export type TriggerKind = 'manual' | 'schedule' | 'webhook' | 'event' | 'test'

const LEASE_MS = 5 * 60_000
const PASS_BUDGET_MS = 45_000

export function stepsOf(wf: Pick<WorkflowDoc, 'steps' | 'nodes' | 'edges'>): StepDef[] {
  if (Array.isArray(wf.steps) && wf.steps.length) return wf.steps
  return legacyStepsFrom(wf.nodes || [], wf.edges || [])
}

export function runContext(wf: Pick<WorkflowDoc, 'id' | 'name' | 'tenant_id'>, run: { id: string; trigger_payload?: Record<string, unknown> | null; trigger_kind?: string }, now: Date): Ctx {
  const vars = builtinVars(now, getAppOrigin())
  return {
    ...vars, // legacy top-level {{ yesterday }} etc.
    vars,
    trigger: run.trigger_payload || {},
    workflow: { id: wf.id, name: wf.name, tenant_id: wf.tenant_id ?? null },
    run: { id: run.id, trigger: run.trigger_kind || 'manual' },
    steps: {},
  }
}

async function signingSecret(wf: WorkflowDoc): Promise<string | null> {
  if (!wf.webhook_secret_enc) return null
  const { decryptValue } = await import('./settings')
  return decryptValue(wf.webhook_secret_enc)
}

export interface StartOptions {
  trigger: TriggerKind
  payload?: Record<string, unknown> | null
  actorId: string
  dryRun?: boolean
  /** Unique per logical trigger (event id, cron minute…): a duplicate start returns the existing run. */
  idempotencyKey?: string
  cronMinuteKey?: string
  eventId?: string
  /** Run the first pass inline (default true). */
  inline?: boolean
}

export interface StartResult {
  run: WorkflowRunDoc
  duplicate: boolean
}

/** Create a run and (by default) advance it as far as it can go now. */
export async function startWorkflowRun(wf: WorkflowDoc, opts: StartOptions): Promise<StartResult> {
  const runs = await col<WorkflowRunDoc>('workflow_runs')
  const now = new Date()
  const ts = now.toISOString()
  const run = baseRun(wf, opts, ts)
  try {
    await runs.insertOne(run)
  } catch (e) {
    if (isDuplicateKeyError(e) && opts.idempotencyKey) {
      const existing = (await runs.findOne({ idempotency_key: opts.idempotencyKey }, { projection: { _id: 0 } })) as WorkflowRunDoc | null
      if (existing) return { run: existing, duplicate: true }
    }
    throw e
  }
  // Counted only once the run really exists: a duplicate start (second cron tick, webhook
  // redelivery) is a no-op above and uses no quota (AUTO-015).
  if (!opts.dryRun) {
    try {
      await consumeQuota(wf.tenant_id, 'runs', now)
    } catch (e) {
      if (e instanceof QuotaExceededError) {
        const blocked = { status: 'failed' as const, error: e.message, finished_at: ts, updated_at: ts }
        await runs.updateOne({ id: run.id }, { $set: blocked })
        return { run: { ...run, ...blocked }, duplicate: false }
      }
      throw e
    }
  }
  if (opts.inline === false) return { run, duplicate: false }
  const done = await processRun(run.id, wf)
  return { run: done ?? run, duplicate: false }
}

function baseRun(wf: WorkflowDoc, opts: StartOptions, ts: string): WorkflowRunDoc {
  return {
    id: newId(),
    workflow_id: wf.id,
    tenant_id: wf.tenant_id ?? null,
    user_id: opts.actorId,
    status: 'running',
    trigger_kind: opts.dryRun ? 'test' : opts.trigger,
    trigger_payload: sanitizePayload(opts.payload),
    event_id: opts.eventId ?? null,
    dry_run: !!opts.dryRun,
    step_state: {},
    steps: [],
    started_at: ts,
    finished_at: '',
    updated_at: ts,
    duration_ms: 0,
    resume_at: null,
    lease_until: null,
    ...(opts.idempotencyKey ? { idempotency_key: opts.idempotencyKey } : {}),
    ...(opts.cronMinuteKey ? { cron_minute_key: opts.cronMinuteKey } : {}),
  }
}

/**
 * Advance one run (claims a lease first). Returns the updated run, or null
 * when another worker holds it / it is already finished.
 */
export async function processRun(runId: string, wfHint?: WorkflowDoc): Promise<WorkflowRunDoc | null> {
  const runs = await col<WorkflowRunDoc>('workflow_runs')
  const now = new Date()
  const claimed = (await runs.findOneAndUpdate(
    { id: runId, status: { $in: ['running', 'waiting'] }, $or: [{ lease_until: null }, { lease_until: { $exists: false } }, { lease_until: { $lt: now.toISOString() } }] },
    { $set: { lease_until: new Date(now.getTime() + LEASE_MS).toISOString(), status: 'running' } },
    { returnDocument: 'after', projection: { _id: 0 } },
  )) as WorkflowRunDoc | null
  if (!claimed) return null
  const loaded = wfHint && wfHint.id === claimed.workflow_id ? wfHint : ((await (await col<WorkflowDoc>('workflows')).findOne({ id: claimed.workflow_id }, { projection: { _id: 0 } })) as WorkflowDoc | null)
  if (!loaded) {
    await runs.updateOne({ id: runId }, { $set: { status: 'cancelled', error: 'Workflow was deleted', finished_at: nowIso(), lease_until: null } })
    return null
  }
  // W4-08: scheduled copilot reports re-check their creator on every run.
  let wf: WorkflowDoc = loaded
  if (loaded.template_id === 'copilot-scheduled-task' && claimed.trigger_kind !== 'test') {
    const { authoriseCopilotScheduleRun } = await import('@/lib/agent/schedule-guard')
    const ok = await authoriseCopilotScheduleRun(loaded as never) as WorkflowDoc | null
    if (!ok) {
      await runs.updateOne({ id: runId }, { $set: { status: 'cancelled', error: 'The admin who scheduled this report no longer has access — workflow switched off', finished_at: nowIso(), lease_until: null } })
      return null
    }
    wf = ok
  }

  const state: RunState = { step_state: { ...(claimed.step_state || {}) }, logs: [...((claimed.steps || []) as RunState['logs'])] }
  const secret = await signingSecret(wf)
  const actionEnv = { tenantId: wf.tenant_id ?? null, workflowId: wf.id, workflowName: wf.name, runId, signingSecret: secret, eventType: wf.trigger === 'event' ? wf.event_type ?? null : null }
  const persist = async (s: RunState) => {
    await runs.updateOne({ id: runId }, { $set: { step_state: s.step_state, steps: s.logs as WorkflowRunDoc['steps'], updated_at: nowIso() } })
  }

  let result
  try {
    result = await advance(stepsOf(wf), runContext(wf, claimed, now), state, {
      now: () => new Date(),
      dryRun: !!claimed.dry_run,
      persistent: true,
      budgetMs: PASS_BUDGET_MS,
      exec: (step, cfg, raw, ctx, info) => executeAction(step, cfg, raw, ctx, info, actionEnv),
      onProgress: persist,
    })
  } catch (e) {
    result = { status: 'failed' as const, failed_key: 'engine', error: (e as Error).message }
  }

  const finishedAt = nowIso()
  const duration = Date.parse(finishedAt) - Date.parse(claimed.started_at)
  const set: Partial<WorkflowRunDoc> = { step_state: state.step_state, steps: state.logs as WorkflowRunDoc['steps'], lease_until: null, updated_at: finishedAt }
  if (result.status === 'waiting') {
    Object.assign(set, { status: 'waiting', resume_at: result.resume_at })
  } else {
    Object.assign(set, {
      status: result.status,
      resume_at: null,
      finished_at: finishedAt,
      duration_ms: Math.max(0, duration),
      failed_step_key: result.status === 'failed' ? result.failed_key : null,
      error: result.status === 'failed' ? result.error : null,
      ...(result.status === 'success' && result.stopped ? { stopped: true } : {}),
    })
  }
  await runs.updateOne({ id: runId }, { $set: set })
  if (result.status !== 'waiting' && !claimed.dry_run) {
    await (await col('workflows')).updateOne({ id: wf.id }, { $set: { last_run_at: finishedAt, last_run_status: result.status } }).catch(() => {})
  }
  if (result.status === 'failed' && !claimed.dry_run) await onRunFailed(wf, runId, result.failed_key, result.error)
  return { ...claimed, ...set } as WorkflowRunDoc
}

async function onRunFailed(wf: WorkflowDoc, runId: string, stepKey: string, error: string): Promise<void> {
  await deadLetter({ kind: 'run', ref: runId, tenant_id: wf.tenant_id ?? null, error, detail: { workflow_id: wf.id, workflow: wf.name, step: stepKey } })
  try {
    const link = `/dashboard/admin/workflows?workflow=${encodeURIComponent(wf.id)}&run=${encodeURIComponent(runId)}`
    if (wf.tenant_id) {
      // Organisation workflows: tell that organisation's admins (in-app), once per workflow per hour.
      const { claimOnce } = await import('./store')
      if (await claimOnce(`wf-fail:${wf.id}:${Math.floor(Date.now() / 3_600_000)}`)) {
        const { tenantAdminUsers } = await import('./mailer')
        const { notifyMany } = await import('@/lib/notifications')
        const admins = await tenantAdminUsers(wf.tenant_id)
        await notifyMany(admins.map((a) => a.id), { type: 'automation.failed', title: `Workflow “${wf.name}” failed`, message: error.slice(0, 300), link, icon: 'alert-circle' })
      }
    } else {
      const { sendAdminAlert } = await import('./alerts')
      await sendAdminAlert({ key: `wf-fail:${wf.id}`, title: `Workflow “${wf.name}” failed`, detail: `Step ${stepKey}: ${error}`, severity: 'warning', link })
    }
  } catch (e) {
    console.error('[automation/runs] failure alert failed:', e)
  }
}

/** Resume runs whose wait is over. */
export async function resumeDueRuns(now = new Date(), budgetMs = 20_000, limit = 25): Promise<number> {
  const runs = await col<WorkflowRunDoc>('workflow_runs')
  const started = Date.now()
  const due = (await runs
    .find({
      status: { $in: ['waiting', 'running'] },
      $or: [
        { resume_at: { $lte: now.toISOString() } },
        // crashed mid-pass (lease expired) or queued without an inline pass
        { status: 'running', lease_until: { $lt: now.toISOString() } },
        { status: 'running', lease_until: null, started_at: { $lt: new Date(now.getTime() - 30_000).toISOString() } },
      ],
    }, { projection: { id: 1 } })
    .sort({ resume_at: 1 })
    .limit(limit)
    .toArray()) as Pick<WorkflowRunDoc, 'id'>[]
  let n = 0
  for (const r of due) {
    if (Date.now() - started > budgetMs) break
    if (await processRun(r.id)) n++
  }
  return n
}

/** Re-run a failed run from the step that failed (earlier steps are not repeated). */
export async function rerunFromFailed(runId: string, actorId: string): Promise<WorkflowRunDoc | null> {
  const runs = await col<WorkflowRunDoc>('workflow_runs')
  const run = (await runs.findOne({ id: runId }, { projection: { _id: 0 } })) as WorkflowRunDoc | null
  if (!run || (run.status !== 'failed' && run.status !== 'partial')) return null
  const state: RunState = { step_state: { ...(run.step_state || {}) }, logs: [...((run.steps || []) as RunState['logs'])] }
  if (!resetFailedSteps(state)) return null
  state.logs.push({ key: 'rerun', node_id: 'rerun', label: `Re-run from failed step by ${actorId === 'system' ? 'system' : 'an admin'}`, type: 'log', ok: true, duration_ms: 0, attempt: 1, at: nowIso() })
  const r = await runs.updateOne(
    { id: runId, status: run.status },
    { $set: { status: 'running', step_state: state.step_state, steps: state.logs as WorkflowRunDoc['steps'], failed_step_key: null, error: null, finished_at: '', lease_until: null, resume_at: null, updated_at: nowIso() } },
  )
  if (!r.modifiedCount) return null
  return processRun(runId)
}

export async function cancelRun(runId: string): Promise<boolean> {
  const runs = await col<WorkflowRunDoc>('workflow_runs')
  const r = await runs.updateOne({ id: runId, status: { $in: ['waiting', 'running'] } }, { $set: { status: 'cancelled', finished_at: nowIso(), lease_until: null, resume_at: null } })
  return r.modifiedCount > 0
}

/**
 * One-shot execution without a saved run (legacy API used by older callers).
 * Waits longer than 5 s and retries are not available here.
 */
export async function executeEphemeral(wf: WorkflowDoc, payload: Record<string, unknown> = {}): Promise<{ status: 'success' | 'failed' | 'partial'; steps: WorkflowRunDoc['steps']; duration_ms: number }> {
  const started = Date.now()
  const runId = `adhoc-${newId()}`
  const state: RunState = { step_state: {}, logs: [] }
  const secret = await signingSecret(wf)
  const result = await advance(stepsOf(wf), runContext(wf, { id: runId, trigger_payload: payload }, new Date()), state, {
    now: () => new Date(),
    dryRun: false,
    persistent: false,
    exec: (step, cfg, raw, ctx, info) => executeAction(step, cfg, raw, ctx, info, { tenantId: wf.tenant_id ?? null, workflowId: wf.id, workflowName: wf.name, runId, signingSecret: secret, eventType: wf.trigger === 'event' ? wf.event_type ?? null : null }),
  })
  const status = result.status === 'waiting' ? 'partial' : result.status
  return { status, steps: state.logs as WorkflowRunDoc['steps'], duration_ms: Date.now() - started }
}
