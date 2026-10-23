/**
 * Agent loop runner (server only).
 *
 *   runDueAgentLoops(now)          from the platform scheduler (lib/platform-cron.ts), every 5 minutes:
 *                                  each switched-on loop that is due claims its window in the
 *                                  database (one run per window across replicas, failed runs retried)
 *                                  and records a heartbeat for the job health view.
 *   runAgentLoopNow(id, actorId)   "Run now" from Admin → Agent loops (ignores the on/off switch and
 *                                  the schedule, never the AI caps); one manual run per loop per minute.
 *
 * Every run writes a run-log row (counts and codes only) and its findings,
 * then emits `agent_loop.run_finished` for workflows.
 */
import 'server-only'
import { AGENT_LOOPS, loopDef, loopWindow, type AgentLoopId } from './registry'
import type { AgentLoopSettings } from './settings'
import type { LoopAiTally } from './ai'
import type { LoopResult, LoopRunDoc } from './types'

export interface LoopContext {
  loop: AgentLoopId
  now: Date
  settings: AgentLoopSettings
  state: Record<string, unknown>
  runId: string
  trigger: LoopRunDoc['trigger']
  by: string | null
  ai: LoopAiTally
  /** True when the run's time budget is used up (stop early; the next run continues). */
  timeUp: () => boolean
  saveState: (s: Record<string, unknown>) => Promise<void>
  /** Test seams. */
  deps?: {
    checkLink?: (url: string) => Promise<{ ok: boolean; status?: number }>
    exec?: (o: { language: string; source: string; stdin: string }) => Promise<{ stdout: string; code: number; stderr?: string }>
  }
}

const IMPL: Record<AgentLoopId, () => Promise<(ctx: LoopContext) => Promise<LoopResult>>> = {
  'content-qa': async () => (await import('./loops/content-qa')).runContentQa,
  'seo-gap': async () => (await import('./loops/seo-gap')).runSeoGap,
  'community-mod': async () => (await import('./loops/community-mod')).runCommunityMod,
  'analytics-insight': async () => (await import('./loops/analytics-insight')).runAnalyticsInsight,
  'social-pack': async () => (await import('./loops/social-pack')).runSocialPack,
}

const BUDGET_MS = 4 * 60_000

/** Run one loop now and record it. Throws on failure (the lease records it and retries). */
export async function executeLoop(loop: AgentLoopId, window: string, trigger: LoopRunDoc['trigger'], by: string | null, now = new Date()): Promise<LoopRunDoc> {
  const store = await import('./store')
  const { settings, state } = await store.getLoopSettings(loop)
  const run = await store.startRun(loop, window, trigger, by, now)
  const started = Date.now()
  const ctx: LoopContext = {
    loop, now, settings, state, runId: run.id, trigger, by,
    ai: { calls: 0, fallback: null },
    timeUp: () => Date.now() - started > BUDGET_MS,
    saveState: (s) => store.setLoopState(loop, s),
  }
  try {
    const fn = await IMPL[loop]()
    const res = await fn(ctx)
    const created = await store.upsertFindings(loop, run.id, res.findings, now)
    const done: LoopRunDoc = { ...run, status: 'ok', summary: res.summary, notes: res.notes ?? [], ai: ctx.ai, findings: res.findings.length }
    await store.finishRun(run.id, { status: 'ok', summary: { ...res.summary, new_findings: created }, notes: (res.notes ?? []).slice(0, 20), ai: ctx.ai, findings: res.findings.length }, run.started_at)
    const { emit } = await import('@/lib/automation/events')
    void emit('agent_loop.run_finished', { loop, run_id: run.id, trigger, findings: res.findings.length, new_findings: created }, { tenantId: null, idempotencyKey: `agent_loop.run_finished:${run.id}` }).catch(() => undefined)
    return done
  } catch (e) {
    const msg = ((e as Error)?.message || 'failed').slice(0, 300)
    await store.finishRun(run.id, { status: 'error', error: msg, ai: ctx.ai }, run.started_at).catch(() => undefined)
    throw e
  }
}

export interface LoopsReport { ran: string[]; skipped: string[]; failed: string[] }

export async function runDueAgentLoops(now = new Date()): Promise<LoopsReport> {
  const report: LoopsReport = { ran: [], skipped: [], failed: [] }
  const [{ getLoopSettings }, { runLeasedJob }] = await Promise.all([import('./store'), import('@/lib/automation/job-lease')])
  for (const def of AGENT_LOOPS) {
    const { settings } = await getLoopSettings(def.id).catch(() => ({ settings: null }))
    const window = settings?.enabled ? loopWindow(def, settings, now) : null
    if (!window) { report.skipped.push(def.heartbeat); continue }
    const r = await runLeasedJob(def.heartbeat, window, () => executeLoop(def.id, window, 'schedule', null, now), {
      now, heartbeat: def.heartbeat, leaseMs: 20 * 60_000, maxAttempts: def.cadence === 'every30' ? 1 : 3, retryAfterMs: 15 * 60_000,
    })
    if (!r.ran) report.skipped.push(def.heartbeat)
    else (r.ok ? report.ran : report.failed).push(def.heartbeat)
  }
  return report
}

export async function runAgentLoopNow(loop: AgentLoopId, actorId: string, now = new Date()): Promise<{ ok: true; run: LoopRunDoc } | { ok: false; reason: 'busy' | 'failed'; error?: string }> {
  const { runLeasedJob } = await import('@/lib/automation/job-lease')
  const window = `manual:${now.toISOString().slice(0, 16)}`
  const r = await runLeasedJob(`${loopDef(loop).heartbeat}:manual`, window, () => executeLoop(loop, window, 'manual', actorId, now), { now, heartbeat: loopDef(loop).heartbeat, leaseMs: 10 * 60_000, maxAttempts: 1 })
  if (!r.ran) return { ok: false, reason: 'busy' }
  return r.ok ? { ok: true, run: r.result } : { ok: false, reason: 'failed', error: r.error }
}
