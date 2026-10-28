/**
 * Workflow execution engine — public entry points (v2).
 *
 * v1 workflows (nodes + edges) keep working: they are converted to a linear
 * step list and every `trigger.*` node is a no-op start (A-014). v2 workflows
 * store `steps` (with if/else branches, filters, waits and for-each loops).
 *
 *   lib/automation/engine.ts        step walker (replayable state, waits, retries)
 *   lib/automation/actions.ts       step executors (email, WhatsApp, in-app, Slack/Teams,
 *                                   signed webhooks, ATS actions, XP, certificates,
 *                                   allow-listed reads/updates, AI with prompt guard)
 *   lib/automation/runs.ts          saved runs: start / resume / re-run from failed step
 *   lib/automation/events.ts        platform event bus (event triggers)
 *   lib/automation/steps-catalog.ts step types + definition validation
 *
 * Triggers: manual, schedule (cron, lib/scheduler.ts), event (type + filter),
 * signed inbound webhook (/api/workflows/hooks/[id], HMAC).
 */
import type { WorkflowDoc, WorkflowRunDoc } from '@/lib/db/leaderboard'
import { executeEphemeral, startWorkflowRun, type StartOptions } from '@/lib/automation/runs'

export interface WorkflowStepResult {
  node_id: string
  label: string
  ok: boolean
  output?: unknown
  error?: string
  duration_ms: number
}

/**
 * One-shot execution without a saved run (kept for older callers). Prefer
 * `runWorkflow`, which saves the run so waits and retries work.
 */
export async function executeWorkflow(
  wf: WorkflowDoc,
  payload: Record<string, unknown> = {},
): Promise<{
  status: 'success' | 'failed' | 'partial'
  steps: WorkflowStepResult[]
  duration_ms: number
}> {
  return executeEphemeral(wf, payload)
}

/** Start a saved run (manual / test / webhook). */
export async function runWorkflow(wf: WorkflowDoc, opts: StartOptions): Promise<WorkflowRunDoc> {
  return (await startWorkflowRun(wf, opts)).run
}

export { stepsOf } from '@/lib/automation/runs'
