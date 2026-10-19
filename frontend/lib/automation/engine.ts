/**
 * Workflow engine v2 — the step walker (no I/O; side effects are injected).
 *
 * Execution is *replayable*: every step instance has a key (its id, or
 * `loopId/3/childId` inside a for-each) and its outcome is stored in
 * `state.step_state[key]`. To resume a run (after a wait, a retry backoff, a
 * restart, or "re-run from failed step") the walker starts again from the top
 * and skips every step that is already done, re-using its stored output, so
 * side effects never repeat and branches resolve exactly as before.
 *
 * Waits (delay steps, retry backoff) never sleep: the walker returns
 * `{ status: 'waiting', resume_at }` and the caller persists the run; the
 * scheduler resumes it when the time comes.
 */
import { evaluateCondition, type Condition } from './conditions'
import { interpolate, interpolateDeep, interpolateString, type Ctx } from './interpolate'
import { clampRetries, clampTimeoutMs, nextRetry, STEP_BACKOFF, withTimeout } from './backoff'
import { DEFAULT_STEP_RETRIES, stepTypeDef, type StepDef } from './steps-catalog'

export interface StepState {
  status: 'done' | 'skipped' | 'failed' | 'waiting' | 'retry_wait'
  output?: unknown
  attempts?: number
  resume_at?: string | null
  error?: string | null
  items?: unknown[]
}

export interface StepLog {
  key: string
  node_id: string
  label: string
  type: string
  ok: boolean
  output?: unknown
  error?: string
  duration_ms: number
  attempt: number
  at: string
  dry_run?: boolean
}

export interface RunState {
  step_state: Record<string, StepState>
  logs: StepLog[]
}

export interface ExecInfo {
  key: string
  attempt: number
  dryRun: boolean
  /** Aborted when the step times out — executors pass it to their network calls. */
  signal?: AbortSignal
}

export interface EngineEnv {
  now: () => Date
  dryRun: boolean
  /** Runs are saved, so waits/retries can resume later. False = one-shot (legacy executeWorkflow). */
  persistent: boolean
  /** Execute one action step. `cfg` is interpolated; `raw` is the stored config. */
  exec: (step: StepDef, cfg: Record<string, unknown>, raw: Record<string, unknown>, ctx: Ctx, info: ExecInfo) => Promise<unknown>
  /** Called after every state change (persist progress). */
  onProgress?: (state: RunState) => Promise<void>
  /** Stop starting new steps after this many ms (the run resumes next tick). */
  budgetMs?: number
}

export type AdvanceResult =
  | { status: 'success'; stopped?: boolean }
  | { status: 'partial' }
  | { status: 'waiting'; resume_at: string }
  | { status: 'failed'; failed_key: string; error: string }

type Signal = { kind: 'continue' } | { kind: 'wait'; at: string } | { kind: 'stop' } | { kind: 'fail'; key: string; error: string }

const MAX_LOOP_ITEMS = 100
const MAX_LOGS = 400
const MAX_OUTPUT_CHARS = 20_000

/** Config keys that executors interpolate themselves (escaped HTML, conditions). */
const RAW_KEYS = new Set(['if', 'body_html'])

/** Keep stored outputs small (they live in the run doc). */
export function clampOutput(v: unknown): unknown {
  if (v === undefined) return null
  try {
    const s = JSON.stringify(v)
    if (s === undefined) return null
    if (s.length <= MAX_OUTPUT_CHARS) return v
    return { truncated: true, preview: s.slice(0, MAX_OUTPUT_CHARS) }
  } catch {
    return String(v).slice(0, MAX_OUTPUT_CHARS)
  }
}

function errMsg(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 500)
}

/** When does a delay step end? null = no wait needed (time already passed). */
export function delayUntil(cfg: Record<string, unknown>, ctx: Ctx, now: Date): Date | null {
  const offsetMin = Number(cfg.offset_minutes) || 0
  if (cfg.until !== undefined && cfg.until !== null && String(cfg.until).trim()) {
    const raw = interpolate(String(cfg.until), ctx)
    const t = raw instanceof Date ? raw.getTime() : Date.parse(String(raw ?? ''))
    if (Number.isNaN(t)) throw new Error('Wait: "until" is not a valid date')
    const at = t + offsetMin * 60_000
    return at > now.getTime() ? new Date(at) : null
  }
  const amount = Number(interpolate(String(cfg.amount ?? ''), ctx))
  if (!Number.isFinite(amount) || amount <= 0) return null
  const unit = String(cfg.unit || 'minutes')
  const ms = Math.min(90 * 86_400_000, amount * (unit === 'days' ? 86_400_000 : unit === 'hours' ? 3_600_000 : 60_000))
  return new Date(now.getTime() + ms)
}

export async function advance(steps: StepDef[], baseCtx: Ctx, state: RunState, env: EngineEnv): Promise<AdvanceResult> {
  const started = Date.now()
  let anyFailedContinue = false
  const ctx: Ctx = { ...baseCtx, steps: { ...((baseCtx.steps as Ctx) || {}) } }

  const progress = async () => {
    if (state.logs.length > MAX_LOGS) state.logs.splice(0, state.logs.length - MAX_LOGS)
    if (env.onProgress) await env.onProgress(state)
  }
  const setOutput = (id: string, out: unknown, scope: Ctx) => {
    ;(ctx.steps as Ctx)[id] = out
    scope[id] = out // legacy {{nodeId}} access
  }
  const log = (key: string, step: StepDef, ok: boolean, t0: number, attempt: number, extra: Partial<StepLog> = {}) => {
    state.logs.push({
      key, node_id: step.id, label: step.label || step.type, type: step.type, ok,
      duration_ms: Date.now() - t0, attempt, at: env.now().toISOString(), ...(env.dryRun ? { dry_run: true } : {}), ...extra,
    })
  }

  async function walk(list: StepDef[], prefix: string, scope: Ctx): Promise<Signal> {
    for (const step of list) {
      const key = prefix ? `${prefix}/${step.id}` : step.id
      const st = state.step_state[key]
      const local: Ctx = { ...ctx, ...scope, steps: ctx.steps }

      // Legacy trigger nodes are no-op starts.
      if (step.type.startsWith('trigger.')) {
        if (!st) {
          state.step_state[key] = { status: 'done', output: { triggered: true } }
          log(key, step, true, Date.now(), 1, { output: { triggered: true } })
        }
        setOutput(step.id, { triggered: true, ts: env.now().toISOString() }, scope)
        continue
      }

      if (st?.status === 'skipped') continue
      if (st?.status === 'failed') {
        // continue_on_error failure from an earlier pass
        anyFailedContinue = true
        continue
      }

      // ── Containers ─────────────────────────────────────────────────────
      if (step.type === 'condition') {
        let branch: 'then' | 'else'
        if (st?.status === 'done') branch = (st.output as { branch?: 'then' | 'else' })?.branch === 'else' ? 'else' : 'then'
        else {
          const t0 = Date.now()
          const matched = evaluateCondition((step.config?.if as Condition) || null, local)
          branch = matched ? 'then' : 'else'
          state.step_state[key] = { status: 'done', output: { matched, branch } }
          log(key, step, true, t0, 1, { output: { matched, branch } })
          await progress()
        }
        setOutput(step.id, state.step_state[key].output, scope)
        const sig = await walk((branch === 'then' ? step.then : step.else) || [], key, scope)
        if (sig.kind !== 'continue') return sig
        continue
      }

      if (step.type === 'filter') {
        if (st?.status === 'done') {
          if ((st.output as { passed?: boolean })?.passed === false) return { kind: 'stop' }
          continue
        }
        const t0 = Date.now()
        const passed = evaluateCondition((step.config?.if as Condition) || null, local)
        state.step_state[key] = { status: 'done', output: { passed } }
        log(key, step, true, t0, 1, { output: { passed } })
        setOutput(step.id, { passed }, scope)
        await progress()
        if (!passed) return { kind: 'stop' }
        continue
      }

      if (step.type === 'for_each') {
        let items: unknown[]
        if (st?.items) items = st.items
        else {
          const raw = interpolate(String(step.config?.items ?? ''), local)
          const list = Array.isArray(raw) ? raw : typeof raw === 'string' && raw.trim().startsWith('[') ? safeJson(raw) : []
          items = (Array.isArray(list) ? list : []).slice(0, MAX_LOOP_ITEMS)
          state.step_state[key] = { status: 'waiting', items }
          log(key, step, true, Date.now(), 1, { output: { items: items.length } })
          await progress()
        }
        for (let i = 0; i < items.length; i++) {
          const sig = await walk(step.steps || [], `${key}/${i}`, { ...scope, item: items[i], index: i })
          if (sig.kind !== 'continue') return sig
        }
        state.step_state[key] = { ...state.step_state[key], status: 'done', output: { items: items.length } }
        setOutput(step.id, { count: items.length }, scope)
        continue
      }

      if (st?.status === 'done') {
        setOutput(step.id, st.output, scope)
        continue
      }

      // Out of time for this pass: resume on the next tick (persistent runs only).
      if (env.persistent && env.budgetMs && Date.now() - started > env.budgetMs) {
        return { kind: 'wait', at: env.now().toISOString() }
      }

      // ── Delay ──────────────────────────────────────────────────────────
      if (step.type === 'delay') {
        const now = env.now()
        if (st?.status === 'waiting' && st.resume_at) {
          if (Date.parse(st.resume_at) > now.getTime()) return { kind: 'wait', at: st.resume_at }
          state.step_state[key] = { status: 'done', output: { waited_until: st.resume_at } }
          log(key, step, true, Date.now(), 1, { output: { waited_until: st.resume_at } })
          setOutput(step.id, state.step_state[key].output, scope)
          await progress()
          continue
        }
        const t0 = Date.now()
        let until: Date | null
        try {
          until = delayUntil(step.config || {}, local, now)
        } catch (e) {
          state.step_state[key] = { status: 'failed', error: errMsg(e), attempts: 1 }
          log(key, step, false, t0, 1, { error: errMsg(e) })
          await progress()
          return { kind: 'fail', key, error: errMsg(e) }
        }
        if (!until || env.dryRun) {
          const out = until ? { would_wait_until: until.toISOString() } : { waited: false }
          state.step_state[key] = { status: 'done', output: out }
          log(key, step, true, t0, 1, { output: out })
          setOutput(step.id, out, scope)
          await progress()
          continue
        }
        if (!env.persistent) {
          const ms = until.getTime() - now.getTime()
          if (ms <= 5_000) {
            await new Promise((r) => setTimeout(r, ms))
            state.step_state[key] = { status: 'done', output: { waited_ms: ms } }
            log(key, step, true, t0, 1, { output: { waited_ms: ms } })
            setOutput(step.id, { waited_ms: ms }, scope)
            continue
          }
          const msg = 'Waits longer than 5 seconds need a saved run (use Run or a trigger)'
          state.step_state[key] = { status: 'failed', error: msg, attempts: 1 }
          log(key, step, false, t0, 1, { error: msg })
          return { kind: 'fail', key, error: msg }
        }
        state.step_state[key] = { status: 'waiting', resume_at: until.toISOString() }
        log(key, step, true, t0, 1, { output: { waiting_until: until.toISOString() } })
        await progress()
        return { kind: 'wait', at: until.toISOString() }
      }

      // ── Retry backoff in progress ──────────────────────────────────────
      if (st?.status === 'retry_wait' && st.resume_at && Date.parse(st.resume_at) > env.now().getTime()) {
        return { kind: 'wait', at: st.resume_at }
      }

      // ── Action / data steps ────────────────────────────────────────────
      const raw = step.config || {}
      const cfg: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(raw)) cfg[k] = RAW_KEYS.has(k) ? v : interpolateDeep(v, local)
      const attempt = (st?.attempts || 0) + 1
      const t0 = Date.now()
      try {
        let out: unknown
        if (step.type === 'log') out = { message: interpolateString(raw.message ?? '', local) }
        else {
          const ac = new AbortController()
          out = await withTimeout(env.exec(step, cfg, raw, local, { key, attempt, dryRun: env.dryRun, signal: ac.signal }), clampTimeoutMs(raw.timeout_ms), `"${step.label || step.type}" timed out`, ac)
        }
        const stored = clampOutput(out)
        state.step_state[key] = { status: 'done', output: stored, attempts: attempt }
        log(key, step, true, t0, attempt, { output: stored })
        setOutput(step.id, stored, scope)
        await progress()
      } catch (e) {
        const error = errMsg(e)
        log(key, step, false, t0, attempt, { error })
        // Same default as the builder: side-effect steps retry twice unless the admin set a number (AUTO-010).
        const retries = env.dryRun ? 0 : clampRetries(raw.retries, 5, stepTypeDef(step.type)?.sideEffect ? DEFAULT_STEP_RETRIES : 0)
        const decision = nextRetry(attempt, retries, STEP_BACKOFF, env.now())
        if (decision.retry && decision.at && env.persistent && !isPermanent(e)) {
          state.step_state[key] = { status: 'retry_wait', attempts: attempt, resume_at: decision.at.toISOString(), error }
          await progress()
          return { kind: 'wait', at: decision.at.toISOString() }
        }
        state.step_state[key] = { status: 'failed', attempts: attempt, error }
        await progress()
        if (raw.continue_on_error === true) {
          anyFailedContinue = true
          continue
        }
        return { kind: 'fail', key, error }
      }
    }
    return { kind: 'continue' }
  }

  const sig = await walk(steps, '', {})
  if (sig.kind === 'wait') return { status: 'waiting', resume_at: sig.at }
  if (sig.kind === 'fail') return { status: 'failed', failed_key: sig.key, error: sig.error }
  if (sig.kind === 'stop') return { status: 'success', stopped: true }
  return anyFailedContinue ? { status: 'partial' } : { status: 'success' }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return []
  }
}

/** Errors that retrying can't fix (validation, permissions) — tagged by executors. */
export class PermanentStepError extends Error {
  permanent = true
}
function isPermanent(e: unknown): boolean {
  return !!(e && typeof e === 'object' && (e as { permanent?: boolean }).permanent)
}

/**
 * Clear a failed step (and anything after it that never ran) so the run can
 * be re-run from that step. Returns false when there is no failed step.
 */
export function resetFailedSteps(state: RunState): boolean {
  let changed = false
  for (const [k, v] of Object.entries(state.step_state)) {
    if (v.status === 'failed' || v.status === 'retry_wait') {
      delete state.step_state[k]
      changed = true
    }
  }
  return changed
}

/** Legacy v1 (nodes + edges) → linear step list. */
export function legacyStepsFrom(nodes: { id: string; type: string; label?: string; config?: Record<string, unknown> }[], edges: { from: string; to: string }[]): StepDef[] {
  const ordered = orderNodes(nodes, edges)
  return ordered.map((n) => ({ id: n.id, type: n.type, label: n.label, config: n.config || {} }))
}

function orderNodes<N extends { id: string }>(nodes: N[], edges: { from: string; to: string }[]): N[] {
  if (!edges?.length) return nodes
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const incoming = new Map<string, number>()
  for (const n of nodes) incoming.set(n.id, 0)
  for (const e of edges) incoming.set(e.to, (incoming.get(e.to) || 0) + 1)
  const queue = nodes.filter((n) => (incoming.get(n.id) || 0) === 0).map((n) => n.id)
  const ordered: N[] = []
  const seen = new Set<string>()
  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    const node = byId.get(id)
    if (node) ordered.push(node)
    for (const e of edges) if (e.from === id && !seen.has(e.to)) queue.push(e.to)
  }
  for (const n of nodes) if (!seen.has(n.id)) ordered.push(n)
  return ordered
}
