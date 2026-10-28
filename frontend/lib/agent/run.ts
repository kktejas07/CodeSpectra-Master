/**
 * The admin agent's tool-calling loop, v2 (provider-agnostic, no DB or HTTP
 * here — persistence, budgets, credits and streaming are injected by the
 * service / API route).
 *
 * Plan → act → observe → reflect, per turn:
 *  - plan:     the model calls plan_steps (or the loop derives a plan from the
 *              first multi-tool step); the UI shows it as a checklist that is
 *              ticked off as tools finish.
 *  - act:      read tools run immediately — independent reads in one step run
 *              in parallel; write tools only `propose()` (pending ProposedAction,
 *              confirmed by a human). propose_bundle drafts linked proposals the
 *              admin confirms together. delegate_to_specialist hands a sub-task
 *              to a focused sub-agent (same permission + tenant checks).
 *  - observe:  tool output goes back to the model wrapped as untrusted data;
 *              transient tool / provider errors are retried.
 *  - reflect:  before the final answer a self-check verifies ids and "done"
 *              claims against tool results and asks for one revision if needed.
 * Limits: a step budget and a token budget per turn (plus the organisation's
 * remaining budget); on any stop the admin gets "what I did / what's left".
 * ask_clarifying_question ends the turn with a question.
 */
import {
  ToolInputError,
  ToolPermissionError,
  type AgentCaller,
  type AgentEvent,
  type AgentTool,
  type KnowledgeHit,
  type ProposalBundle,
  type ProposedAction,
  type ToolContext,
} from '@/lib/agent/contract'
import { assertToolAccess } from '@/lib/agent/permissions'
import { buildSystemPrompt, summariseToolData, wrapToolOutput } from '@/lib/agent/prompt'
import type { ChatMessage, ChatProvider, ToolCall, ToolSpec } from '@/lib/agent/providers/types'
import type { UsageEntry } from '@/lib/agent/metering'
import { revisionNote, selfCheckAnswer, type SelfCheckIssue } from '@/lib/agent/selfcheck'
import {
  availableSpecialists, specialistById, specialistTools, type Specialist, type SpecialistId,
} from '@/lib/agent/specialists'

export const DEFAULT_MAX_STEPS = 8
export const DEFAULT_TURN_TOKEN_CAP = 150_000
export const DEFAULT_MAX_OUTPUT_TOKENS = 2048
export const MAX_TOOL_CALLS_PER_STEP = 6
export const MAX_PROPOSALS_PER_TURN = 5
export const MAX_BUNDLES_PER_TURN = 2
export const MAX_BUNDLE_STEPS = 8
export const MAX_PLAN_STEPS = 8
export const SUBAGENT_MAX_STEPS = 6
export const PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000

/** Built-in control tools handled by the loop itself (never in the registry). */
export const CONTROL_TOOLS = ['plan_steps', 'ask_clarifying_question', 'delegate_to_specialist', 'propose_bundle'] as const
export type ControlTool = (typeof CONTROL_TOOLS)[number]
const isControl = (name: string): name is ControlTool => (CONTROL_TOOLS as readonly string[]).includes(name)

// ─── Types ───────────────────────────────────────────────────────────────────

export type PlanStepStatus = 'pending' | 'active' | 'done' | 'failed' | 'skipped'
export interface PlanStep {
  id: string
  title: string
  /** Tool (or specialist id) this step expects to use; ticks off when it finishes. */
  tool?: string
  status: PlanStepStatus
}

export interface ClarifyRequest {
  question: string
  options?: string[]
}

/** Stream events: the contract's AgentEvent plus the loop-v2 events. */
export type AgentLoopEvent =
  | AgentEvent
  | { type: 'plan'; steps: PlanStep[] }
  | { type: 'clarify'; id: string; question: string; options?: string[] }
  | { type: 'bundle'; bundle: ProposalBundle }
  | { type: 'self_check'; ok: boolean; issues: SelfCheckIssue[] }
  | { type: 'revise' }
  | { type: 'retry'; what: 'model' | 'tool'; attempt: number; tool?: string }
  | { type: 'subagent'; phase: 'start' | 'end'; id: string; agent: SpecialistId; label: string; task?: string; summary?: string; ok?: boolean }
  | { type: 'subagent_event'; parent: string; agent: SpecialistId; event: AgentLoopEvent }

export interface TurnMessage {
  message: ChatMessage
  /** UI-only facts (never sent to the model). */
  ui?: {
    ok: boolean
    summary: string
    citations?: KnowledgeHit[]
    actionId?: string
    actionIds?: string[]
    bundleId?: string
    plan?: PlanStep[]
    clarify?: ClarifyRequest
    specialist?: SpecialistId
  }
}

export interface RunTurnInput {
  caller: AgentCaller
  conversationId: string
  history: ChatMessage[]
  userText: string
  signal?: AbortSignal
  maxSteps?: number
  maxTokensPerTurn?: number
  maxOutputTokens?: number
  now?: Date
  /** Rolling summary of the conversation before `history` (data). */
  memorySummary?: string | null
  /** Run as this specialist sub-agent (depth 1). */
  specialist?: Specialist | null
  depth?: number
  /** Self-check before the final answer (default on). */
  selfCheck?: boolean
  /** Proposals still allowed in this turn (sub-agents share the parent's allowance). */
  proposalAllowance?: number
  /** Caller's interface language — the model replies in it (buildSystemPrompt). */
  locale?: 'en' | 'hi' | 'te'
}

export interface UsageRecord {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  ok: boolean
  kind?: UsageEntry['kind']
}

export interface RunTurnDeps {
  provider: ChatProvider
  /** Tools offered to the model this turn (may be an intent-routed subset); access is re-checked per call anyway. */
  tools: AgentTool[]
  /** Every tool the caller may use (delegation + bundles look tools up here). Defaults to `tools`. */
  allTools?: AgentTool[]
  saveProposal: (action: ProposedAction) => Promise<void>
  saveBundle?: (bundle: ProposalBundle) => Promise<void>
  emit: (event: AgentLoopEvent) => void
  /** Persist each message as soon as it exists (user turn is persisted by the caller). */
  onMessage?: (m: TurnMessage) => Promise<void> | void
  onUsage?: (u: UsageRecord) => void
  scan?: (text: string) => { flagged: boolean; reasons: string[] }
  newId?: () => string
  /** Organisation budget check before each model call (tokens left). */
  checkBudget?: () => Promise<{ ok: boolean; remaining: number; reason?: string }>
  /** Run `fn` while metering AI usage it causes (AI generation inside propose()). */
  meter?: <T>(fn: () => Promise<T>) => Promise<{ value: T; usage: Omit<UsageEntry, 'kind'>[] }>
  sleep?: (ms: number) => Promise<void>
}

export type TurnStatus = 'ok' | 'max_steps' | 'token_cap' | 'budget' | 'clarify' | 'aborted' | 'error'

export interface TurnResult {
  status: TurnStatus
  messages: TurnMessage[]
  toolCalls: number
  proposals: number
  bundles: number
  usage: { inputTokens: number; outputTokens: number }
  /** Every model call / generation this turn, for metering. */
  usageEntries: UsageEntry[]
  plan: PlanStep[]
  provider?: string
  model?: string
  injectionFlags: string[]
  error?: string
  /** Final assistant text (used by the parent when this was a sub-agent). */
  finalText?: string
}

const defaultId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`)
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function isAbortError(e: unknown, signal?: AbortSignal): boolean {
  return !!signal?.aborted || (e instanceof Error && e.name === 'AbortError')
}

/** Errors worth one more try: network blips, timeouts, 429/5xx, providers temporarily unavailable. */
export function isTransientError(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  if (e instanceof ToolInputError || e instanceof ToolPermissionError || e.name === 'AbortError') return false
  if (/^Mongo(Network|ServerSelection|NotConnected)/.test(e.name) || e.name === 'TimeoutError') return true
  const status = (e as { status?: unknown }).status
  if (typeof status === 'number' && (status === 429 || status >= 500)) return true
  return /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|socket hang up|fetch failed|network error|timed out|temporarily|unavailable right now|\b(429|502|503|504)\b|rate.?limit/i.test(e.message)
}

export function toolSpecs(tools: AgentTool[]): ToolSpec[] {
  return tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }))
}

/** Control-tool specs offered this turn. */
export function controlSpecs(opts: { depth: number; specialists: Specialist[]; hasWrite: boolean; canBundle: boolean }): ToolSpec[] {
  const out: ToolSpec[] = [
    {
      name: 'plan_steps',
      description: 'Show the admin your plan as a checklist before working (for requests needing 2+ tool calls). Each step names the tool it will use; the app ticks steps off as tools finish. Call again only to change the plan.',
      parameters: {
        type: 'object',
        properties: {
          steps: { type: 'array', maxItems: MAX_PLAN_STEPS, items: { type: 'object', properties: { title: { type: 'string', maxLength: 120 }, tool: { type: 'string', description: 'Tool name (or specialist id) this step uses.' } }, required: ['title'] } },
        },
        required: ['steps'],
      },
    },
  ]
  if (opts.depth === 0) {
    out.push({
      name: 'ask_clarifying_question',
      description: 'Ask the admin one short question when a change needs a detail you do not have (which test, what date, how many). Ends this turn; their reply continues it.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', maxLength: 300 },
          options: { type: 'array', maxItems: 5, items: { type: 'string', maxLength: 80 }, description: 'Optional quick answers.' },
        },
        required: ['question'],
      },
    })
    if (opts.specialists.length) {
      out.push({
        name: 'delegate_to_specialist',
        description: `Hand one focused sub-task to a specialist sub-agent with the tools for that area. It returns what it found and any proposals it drafted. Specialists: ${opts.specialists.map((s) => `${s.id} — ${s.description}`).join(' | ')}`,
        parameters: {
          type: 'object',
          properties: {
            specialist: { type: 'string', enum: opts.specialists.map((s) => s.id) },
            task: { type: 'string', maxLength: 2000, description: 'What to do, with every detail it needs (ids, names, dates).' },
          },
          required: ['specialist', 'task'],
        },
      })
    }
    if (opts.hasWrite && opts.canBundle) {
      out.push({
        name: 'propose_bundle',
        description: 'Draft several linked changes as ONE bundle the admin reviews and confirms together (e.g. set up a campus drive). Steps run in the listed order on confirm and stop at the first failure. Each step is a write tool with complete arguments.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', maxLength: 160 },
            summary: { type: 'string', maxLength: 600 },
            steps: {
              type: 'array',
              maxItems: MAX_BUNDLE_STEPS,
              items: { type: 'object', properties: { tool: { type: 'string' }, args: { type: 'object' }, note: { type: 'string', maxLength: 200 } }, required: ['tool', 'args'] },
            },
          },
          required: ['title', 'steps'],
        },
      })
    }
  }
  return out
}

const humanize = (s: string) => s.replace(/[_-]+/g, ' ').trim()

/** Plan from the first multi-tool step when the model did not call plan_steps. */
export function derivePlan(calls: ToolCall[], newId: () => string): PlanStep[] {
  return calls
    .filter((c) => !isControl(c.name))
    .slice(0, MAX_PLAN_STEPS)
    .map((c) => ({ id: newId(), title: `${humanize(c.name)[0]?.toUpperCase() ?? ''}${humanize(c.name).slice(1)}`, tool: c.name, status: 'pending' as const }))
}

/** "Here's what I did / what's left" (markdown). Pure. */
export function progressNote(headline: string, plan: PlanStep[], done: { tool: string; summary: string; ok: boolean }[], proposals: number): string {
  const lines = [headline]
  const doneSteps = plan.filter((p) => p.status === 'done')
  const left = plan.filter((p) => p.status === 'pending' || p.status === 'active')
  const did = doneSteps.length
    ? doneSteps.map((p) => `- ${p.title}`)
    : done.filter((d) => d.ok).slice(-6).map((d) => `- ${humanize(d.tool)}: ${d.summary}`)
  if (did.length) lines.push('', "**Here's what I did**", ...did)
  if (proposals) lines.push(`- Drafted ${proposals} proposal${proposals === 1 ? '' : 's'} for you to review (nothing has changed yet).`)
  if (left.length) lines.push('', "**What's left**", ...left.map((p) => `- ${p.title}`))
  return lines.join('\n')
}

function parsePlanArgs(args: Record<string, unknown>, newId: () => string): PlanStep[] | string {
  const raw = Array.isArray(args.steps) ? args.steps : null
  if (!raw || !raw.length) return '`steps` must be a non-empty list.'
  const out: PlanStep[] = []
  for (const s of raw.slice(0, MAX_PLAN_STEPS)) {
    const o = typeof s === 'string' ? { title: s } : s && typeof s === 'object' ? (s as Record<string, unknown>) : null
    const title = typeof o?.title === 'string' ? o.title.replace(/\s+/g, ' ').trim().slice(0, 120) : ''
    if (!title) continue
    const tool = typeof o?.tool === 'string' && /^[a-z_]{2,60}$/.test(o.tool) ? o.tool : undefined
    out.push({ id: newId(), title, ...(tool ? { tool } : {}), status: 'pending' })
  }
  return out.length ? out : 'Each step needs a title.'
}

// ─── Loop ────────────────────────────────────────────────────────────────────

export async function runAgentTurn(input: RunTurnInput, deps: RunTurnDeps): Promise<TurnResult> {
  const depth = input.depth ?? 0
  const maxSteps = Math.max(1, Math.min(input.maxSteps ?? DEFAULT_MAX_STEPS, 16))
  const tokenCap = input.maxTokensPerTurn ?? DEFAULT_TURN_TOKEN_CAP
  const newId = deps.newId ?? defaultId
  const sleep = deps.sleep ?? defaultSleep
  const now = input.now ?? new Date()
  const ctx: ToolContext = { caller: input.caller, conversationId: input.conversationId, signal: input.signal }
  const allTools = deps.allTools ?? deps.tools
  const selfCheckOn = input.selfCheck !== false
  let proposalAllowance = input.proposalAllowance ?? MAX_PROPOSALS_PER_TURN

  const scan = deps.scan?.(input.userText) ?? { flagged: false, reasons: [] }
  const result: TurnResult = {
    status: 'ok',
    messages: [],
    toolCalls: 0,
    proposals: 0,
    bundles: 0,
    usage: { inputTokens: 0, outputTokens: 0 },
    usageEntries: [],
    plan: [],
    injectionFlags: scan.reasons,
  }

  const specialists = depth === 0 ? availableSpecialists(allTools) : []
  const hasWrite = allTools.some((t) => t.kind === 'write')
  const control = controlSpecs({ depth, specialists, hasWrite, canBundle: !!deps.saveBundle })
  const messages: ChatMessage[] = [...input.history, { role: 'user', content: input.userText }]
  const system = buildSystemPrompt({
    caller: input.caller,
    now,
    tools: deps.tools,
    injectionFlags: scan.reasons,
    control: control.map((c) => c.name),
    specialists: specialists.map((s) => ({ id: s.id, label: s.label, description: s.description })),
    specialist: input.specialist ? { label: input.specialist.label, focus: input.specialist.focus } : null,
    memorySummary: input.memorySummary,
    locale: input.locale,
  })
  const specs = [...toolSpecs(deps.tools), ...control]

  const executed: { tool: string; summary: string; ok: boolean }[] = []
  const turnCitations: KnowledgeHit[] = []
  let planDirty = false
  let revised = false

  const emitPlan = () => {
    if (!planDirty) return
    planDirty = false
    deps.emit({ type: 'plan', steps: result.plan.map((p) => ({ ...p })) })
  }
  const markPlan = (tool: string, status: PlanStepStatus) => {
    const step = status === 'active'
      ? result.plan.find((p) => p.tool === tool && p.status === 'pending')
      : result.plan.find((p) => p.tool === tool && p.status === 'active') ?? result.plan.find((p) => p.tool === tool && p.status === 'pending')
    if (step) {
      step.status = status
      planDirty = true
    }
  }
  const finalisePlan = (ok: boolean) => {
    for (const p of result.plan) {
      if (p.status === 'active') p.status = ok ? 'done' : 'pending'
      else if (p.status === 'pending' && ok) p.status = p.tool ? 'skipped' : 'done'
      planDirty = true
    }
    if (result.plan.length) emitPlan()
  }

  const record = async (m: TurnMessage) => {
    messages.push(m.message)
    result.messages.push(m)
    try {
      await deps.onMessage?.(m)
    } catch (e) {
      console.error('[agent] failed to persist message:', e)
    }
  }

  const stop = async (status: TurnStatus, headline: string) => {
    finalisePlan(false)
    const note = progressNote(headline, result.plan, executed, result.proposals)
    deps.emit({ type: 'text', delta: `\n\n${note}` })
    await record({ message: { role: 'assistant', content: note }, ...(result.plan.length ? { ui: { ok: true, summary: status, plan: result.plan } } : {}) })
    result.status = status
    result.finalText = note
    return result
  }

  const addUsage = (provider: string, model: string, inputTokens: number, outputTokens: number, kind: UsageEntry['kind'], ok: boolean, latencyMs: number) => {
    if (ok) {
      result.usage.inputTokens += inputTokens
      result.usage.outputTokens += outputTokens
    }
    if (inputTokens || outputTokens) result.usageEntries.push({ provider, model, inputTokens, outputTokens, kind })
    deps.onUsage?.({ provider, model, inputTokens, outputTokens, latencyMs, ok, kind })
  }

  for (let step = 0; step < maxSteps; step++) {
    const used = result.usage.inputTokens + result.usage.outputTokens
    if (used >= tokenCap) {
      return stop('token_cap', 'I stopped here because this message reached its usage limit. Send another message to continue.')
    }
    if (deps.checkBudget) {
      let b: { ok: boolean; remaining: number; reason?: string } = { ok: true, remaining: Infinity }
      try { b = await deps.checkBudget() } catch { /* fail open: the route already checked before the turn */ }
      if (!b.ok || b.remaining <= used) {
        return stop('budget', b.reason || 'I stopped here because your organisation reached its AI copilot budget.')
      }
    }

    // ── act: one model call (retried once on a transient failure before any output) ──
    let text = ''
    let calls: ToolCall[] = []
    let stepUsage = { inputTokens: 0, outputTokens: 0 }
    let attempt = 0
    for (;;) {
      const started = Date.now()
      let emitted = false
      text = ''
      calls = []
      stepUsage = { inputTokens: 0, outputTokens: 0 }
      try {
        for await (const chunk of deps.provider.chat({
          system,
          messages,
          tools: specs,
          maxTokens: input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
          signal: input.signal,
        })) {
          if (chunk.type === 'meta') {
            result.provider = chunk.provider
            result.model = chunk.model
          } else if (chunk.type === 'text') {
            emitted = true
            text += chunk.delta
            deps.emit({ type: 'text', delta: chunk.delta })
          } else if (chunk.type === 'tool_call') {
            emitted = true
            calls.push(chunk.call)
          } else if (chunk.type === 'stop') {
            stepUsage = chunk.usage
          }
        }
        addUsage(result.provider ?? deps.provider.provider, result.model ?? deps.provider.model, stepUsage.inputTokens, stepUsage.outputTokens, depth ? 'subagent' : 'chat', true, Date.now() - started)
        break
      } catch (e) {
        const aborted = isAbortError(e, input.signal)
        addUsage(result.provider ?? deps.provider.provider, result.model ?? deps.provider.model, stepUsage.inputTokens, stepUsage.outputTokens, depth ? 'subagent' : 'chat', false, Date.now() - started)
        if (!aborted && !emitted && attempt < 1 && isTransientError(e)) {
          attempt++
          deps.emit({ type: 'retry', what: 'model', attempt })
          await sleep(800)
          if (input.signal?.aborted) {
            result.status = 'aborted'
            return result
          }
          continue
        }
        if (text.trim()) await record({ message: { role: 'assistant', content: text } })
        finalisePlan(false)
        result.status = aborted ? 'aborted' : 'error'
        if (!aborted) result.error = e instanceof Error ? e.message : String(e)
        return result
      }
    }

    const taken = calls.slice(0, MAX_TOOL_CALLS_PER_STEP)

    // ── reflect: final answer → self-check, at most one revision ──
    if (!taken.length) {
      if (selfCheckOn && !revised && step < maxSteps - 1 && (result.toolCalls > 0 || result.proposals > 0) && text.trim()) {
        const evidence = messages.filter((m) => m.role === 'tool').map((m) => m.content)
        const check = selfCheckAnswer({
          answer: text,
          evidence,
          proposalsThisTurn: result.proposals,
          citationTitles: turnCitations.map((c) => c.title),
        })
        if (!check.ok) {
          revised = true
          deps.emit({ type: 'self_check', ok: false, issues: check.issues })
          deps.emit({ type: 'revise' })
          // The rejected draft stays in the model's context only (never persisted or shown).
          messages.push({ role: 'assistant', content: text })
          messages.push({ role: 'user', content: revisionNote(check.issues.filter((i) => i.blocking)) })
          continue
        }
      }
      finalisePlan(true)
      await record({ message: { role: 'assistant', content: text }, ...(result.plan.length ? { ui: { ok: true, summary: 'answer', plan: result.plan } } : {}) })
      result.status = 'ok'
      result.finalText = text
      return result
    }

    await record({ message: { role: 'assistant', content: text, toolCalls: taken } })

    // Auto-plan: the first step fans out to several tools without a plan.
    if (!result.plan.length && step === 0 && taken.filter((c) => !isControl(c.name)).length >= 2 && !taken.some((c) => c.name === 'plan_steps')) {
      result.plan = derivePlan(taken, newId)
      planDirty = true
      emitPlan()
    }

    if (input.signal?.aborted) {
      result.status = 'aborted'
      return result
    }

    // ── observe: control tools first, reads in parallel, writes in order ──
    const outcomes = new Array<ToolOutcome | undefined>(taken.length)
    const asked: { value: (ClarifyRequest & { id: string }) | null } = { value: null }

    const runOne = async (i: number) => {
      const call = taken[i]
      result.toolCalls++
      if (call.name !== 'plan_steps') {
        deps.emit({ type: 'tool_call', id: call.id, tool: call.name, args: call.args })
        markPlan(call.name === 'delegate_to_specialist' ? String(call.args.specialist ?? '') : call.name, 'active')
        if (call.name === 'delegate_to_specialist') markPlan(call.name, 'active')
        emitPlan()
      }
      let out: ToolOutcome
      if (call.name === 'plan_steps') {
        const parsed = parsePlanArgs(call.args, newId)
        if (typeof parsed === 'string') {
          out = { ok: false, content: wrapToolOutput(call.name, { status: 'invalid_arguments', error: parsed }), summary: 'Plan not set' }
        } else {
          result.plan = parsed
          planDirty = true
          emitPlan()
          out = { ok: true, content: wrapToolOutput(call.name, { status: 'ok', data: { steps: parsed.length, note: 'Plan shown to the admin. Now carry it out.' } }), summary: `Plan with ${parsed.length} steps` }
        }
      } else if (call.name === 'ask_clarifying_question') {
        const question = typeof call.args.question === 'string' ? call.args.question.replace(/\s+/g, ' ').trim().slice(0, 300) : ''
        if (!question || depth > 0) {
          out = { ok: false, content: wrapToolOutput(call.name, { status: 'invalid_arguments', error: depth > 0 ? 'Sub-agents cannot ask the admin; report what is missing instead.' : '`question` is required.' }), summary: 'Question not asked' }
        } else {
          const options = Array.isArray(call.args.options)
            ? call.args.options.filter((o): o is string => typeof o === 'string' && !!o.trim()).map((o) => o.trim().slice(0, 80)).slice(0, 5)
            : []
          asked.value = { id: call.id, question, ...(options.length ? { options } : {}) }
          out = { ok: true, content: wrapToolOutput(call.name, { status: 'asked', data: { note: 'The question is shown to the admin. Stop here; their reply continues the conversation.' } }), summary: 'Asked you a question' }
        }
      } else if (call.name === 'delegate_to_specialist') {
        out = await runDelegate(call)
      } else if (call.name === 'propose_bundle') {
        out = await runBundle(call)
      } else {
        out = await executeToolCallWithRetry(call)
      }
      outcomes[i] = out
      if (call.name !== 'plan_steps') {
        executed.push({ tool: call.name, summary: out.summary, ok: out.ok })
        markPlan(call.name === 'delegate_to_specialist' ? String(call.args.specialist ?? '') : call.name, out.ok ? 'done' : 'failed')
        if (call.name === 'delegate_to_specialist') markPlan(call.name, out.ok ? 'done' : 'failed')
        deps.emit({ type: 'tool_result', id: call.id, tool: call.name, ok: out.ok, summary: out.summary, ...(out.citations?.length ? { citations: out.citations } : {}) })
        if (out.action) deps.emit({ type: 'proposal', action: out.action })
        emitPlan()
      }
      if (out.citations?.length) turnCitations.push(...out.citations)
    }

    const order = taken.map((c, i) => ({ c, i }))
    const controlCalls = order.filter(({ c }) => isControl(c.name))
    const readCalls = order.filter(({ c }) => !isControl(c.name) && allTools.find((t) => t.name === c.name)?.kind === 'read')
    const otherCalls = order.filter(({ c }) => !isControl(c.name) && allTools.find((t) => t.name === c.name)?.kind !== 'read')
    try {
      for (const { i } of controlCalls) {
        if (input.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
        await runOne(i)
      }
      // Independent reads run together.
      await Promise.all(readCalls.map(({ i }) => runOne(i)))
      for (const { i } of otherCalls) {
        if (input.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
        await runOne(i)
      }
    } catch (e) {
      if (!isAbortError(e, input.signal)) throw e
      result.status = 'aborted'
      return result
    }

    for (let i = 0; i < taken.length; i++) {
      const call = taken[i]
      const out = outcomes[i]!
      await record({
        message: { role: 'tool', toolCallId: call.id, toolName: call.name, content: out.content, ...(out.ok ? {} : { isError: true }) },
        ui: {
          ok: out.ok,
          summary: out.summary,
          citations: out.citations,
          actionId: out.action?.id,
          ...(out.actionIds?.length ? { actionIds: out.actionIds } : {}),
          ...(out.bundleId ? { bundleId: out.bundleId } : {}),
          ...(out.specialist ? { specialist: out.specialist } : {}),
          ...(call.name === 'ask_clarifying_question' && asked.value ? { clarify: { question: asked.value.question, ...(asked.value.options ? { options: asked.value.options } : {}) } } : {}),
        },
      })
    }

    if (asked.value) {
      const c = asked.value
      deps.emit({ type: 'clarify', id: c.id, question: c.question, ...(c.options ? { options: c.options } : {}) })
      finalisePlan(false)
      await record({ message: { role: 'assistant', content: c.question }, ui: { ok: true, summary: 'question', clarify: { question: c.question, ...(c.options ? { options: c.options } : {}) }, ...(result.plan.length ? { plan: result.plan } : {}) } })
      result.status = 'clarify'
      result.finalText = c.question
      return result
    }
  }

  return stop('max_steps', `I paused after ${maxSteps} steps for this message. Say "continue" and I'll pick up where I left off.`)

  // ─── helpers (closures over this turn) ─────────────────────────────────────

  async function executeToolCallWithRetry(call: ToolCall): Promise<ToolOutcome> {
    let attempt = 0
    for (;;) {
      const out = await executeToolCall(call, deps, allTools, ctx, result, newId, now, () => proposalAllowance, (n) => { proposalAllowance -= n }, (u) => {
        for (const x of u) addUsage(x.provider, x.model, x.inputTokens, x.outputTokens, 'generation', true, 0)
      })
      if (!out.transient || attempt >= 2 || input.signal?.aborted) return out
      attempt++
      deps.emit({ type: 'retry', what: 'tool', attempt, tool: call.name })
      await sleep(300 * 2 ** (attempt - 1))
    }
  }

  async function runDelegate(call: ToolCall): Promise<ToolOutcome> {
    const fail = (status: string, error: string, summary: string): ToolOutcome => ({ ok: false, content: wrapToolOutput(call.name, { status, error }), summary })
    if (depth > 0) return fail('not_allowed', 'Sub-agents cannot delegate further.', 'Not allowed')
    const spec = specialistById(call.args.specialist)
    const task = typeof call.args.task === 'string' ? call.args.task.trim().slice(0, 2000) : ''
    if (!spec) return fail('invalid_arguments', `Unknown specialist. Use one of: ${specialists.map((s) => s.id).join(', ')}.`, 'Unknown specialist')
    if (!task) return fail('invalid_arguments', '`task` is required.', 'No task given')
    // Same permission + tenant checks: the specialist only gets tools the caller already may use.
    const subTools = specialistTools(spec, allTools)
    if (!subTools.length) return fail('permission_denied', `The ${spec.label} has no tools available to your role.`, 'Not available for your role')
    const usedSoFar = result.usage.inputTokens + result.usage.outputTokens
    deps.emit({ type: 'subagent', phase: 'start', id: call.id, agent: spec.id, label: spec.label, task })
    const sub = await runAgentTurn(
      {
        caller: input.caller,
        conversationId: input.conversationId,
        history: [],
        userText: task,
        signal: input.signal,
        maxSteps: SUBAGENT_MAX_STEPS,
        maxTokensPerTurn: Math.max(1, tokenCap - usedSoFar),
        maxOutputTokens: input.maxOutputTokens,
        now,
        memorySummary: input.memorySummary,
        specialist: spec,
        depth: 1,
        selfCheck: selfCheckOn,
        proposalAllowance,
      },
      {
        ...deps,
        tools: subTools,
        allTools: subTools,
        saveBundle: undefined,
        onMessage: undefined,
        onUsage: (u) => deps.onUsage?.({ ...u, kind: 'subagent' }),
        emit: (e) => deps.emit({ type: 'subagent_event', parent: call.id, agent: spec.id, event: e }),
      },
    )
    if (sub.status === 'aborted') throw Object.assign(new Error('aborted'), { name: 'AbortError' })
    result.usage.inputTokens += sub.usage.inputTokens
    result.usage.outputTokens += sub.usage.outputTokens
    result.usageEntries.push(...sub.usageEntries.map((u) => ({ ...u, kind: u.kind === 'generation' ? 'generation' as const : 'subagent' as const })))
    result.toolCalls += sub.toolCalls
    result.proposals += sub.proposals
    proposalAllowance -= sub.proposals
    const actionIds = sub.messages.map((m) => m.ui?.actionId).filter((x): x is string => !!x)
    const titles = sub.messages.filter((m) => m.ui?.actionId).map((m) => m.ui!.summary)
    const ok = sub.status !== 'error'
    const summary = `${spec.label}: ${sub.toolCalls} step${sub.toolCalls === 1 ? '' : 's'}${actionIds.length ? `, ${actionIds.length} draft${actionIds.length === 1 ? '' : 's'}` : ''}`
    deps.emit({ type: 'subagent', phase: 'end', id: call.id, agent: spec.id, label: spec.label, summary, ok })
    return {
      ok,
      content: wrapToolOutput(call.name, {
        status: ok ? 'ok' : 'error',
        data: {
          specialist: spec.id,
          status: sub.status,
          answer: (sub.finalText || '').slice(0, 3000),
          proposals: actionIds.map((id, i) => ({ action_id: id, summary: titles[i] })),
          note: actionIds.length ? 'Proposals are drafts awaiting the admin\'s confirmation.' : undefined,
        },
        ...(ok ? {} : { error: sub.error?.slice(0, 200) }),
      }),
      summary,
      actionIds,
      specialist: spec.id,
    }
  }

  async function runBundle(call: ToolCall): Promise<ToolOutcome> {
    const fail = (status: string, error: string, summary: string): ToolOutcome => ({ ok: false, content: wrapToolOutput(call.name, { status, error }), summary })
    if (!deps.saveBundle) return fail('error', 'Bundles are not available here; propose the changes one by one.', 'Bundles unavailable')
    if (result.bundles >= MAX_BUNDLES_PER_TURN) return fail('limit', `At most ${MAX_BUNDLES_PER_TURN} bundles per message.`, 'Too many bundles')
    const title = typeof call.args.title === 'string' ? call.args.title.replace(/\s+/g, ' ').trim().slice(0, 160) : ''
    const summaryText = typeof call.args.summary === 'string' ? call.args.summary.trim().slice(0, 600) : undefined
    const steps = Array.isArray(call.args.steps) ? call.args.steps : []
    if (!title) return fail('invalid_arguments', '`title` is required.', 'Bundle needs a title')
    if (steps.length < 2 || steps.length > MAX_BUNDLE_STEPS) return fail('invalid_arguments', `A bundle has 2 to ${MAX_BUNDLE_STEPS} steps.`, 'Bundle size not allowed')

    // Validate + preview every step first; nothing is saved unless all of them work.
    const drafts: { tool: AgentTool; args: Record<string, unknown>; title: string; preview: Record<string, unknown>; note?: string }[] = []
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i] && typeof steps[i] === 'object' ? (steps[i] as Record<string, unknown>) : {}
      const name = typeof st.tool === 'string' ? st.tool : ''
      const tool = allTools.find((t) => t.name === name)
      const where = `Step ${i + 1} (${name || 'no tool'})`
      if (!tool) return fail('unknown_tool', `${where}: there is no tool named ${name}.`, 'Bundle step uses an unknown tool')
      if (tool.kind !== 'write' || !tool.propose) return fail('invalid_arguments', `${where}: only write tools can be bundled; run read tools first.`, 'Bundle step is not a change')
      try {
        assertToolAccess(tool, ctx.caller)
        const args = (await tool.parse(st.args ?? {}, ctx)) as Record<string, unknown>
        const metered = deps.meter ? await deps.meter(() => tool.propose!(args as never, ctx)) : { value: await tool.propose!(args as never, ctx), usage: [] }
        for (const u of metered.usage) addUsage(u.provider, u.model, u.inputTokens, u.outputTokens, 'generation', true, 0)
        drafts.push({ tool, args: (args && typeof args === 'object' ? args : {}) as Record<string, unknown>, title: String(metered.value.title || tool.name).slice(0, 300), preview: metered.value.preview ?? {}, ...(typeof st.note === 'string' ? { note: st.note.slice(0, 200) } : {}) })
      } catch (e) {
        if (isAbortError(e, ctx.signal)) throw e
        const msg = e instanceof ToolInputError || e instanceof ToolPermissionError ? e.message : 'this step could not be drafted'
        return fail(e instanceof ToolPermissionError ? 'permission_denied' : 'invalid_arguments', `${where}: ${msg}. Nothing in the bundle was saved.`, `Bundle step ${i + 1} failed`)
      }
    }
    const created = now.getTime()
    const bundleId = newId()
    const actions: ProposedAction[] = drafts.map((d, i) => ({
      id: newId(),
      conversationId: ctx.conversationId,
      tool: d.tool.name,
      risk: d.tool.risk === 'none' ? 'update' : d.tool.risk,
      title: d.title,
      preview: { ...d.preview, ...(d.note ? { note: d.note } : {}) },
      args: d.args,
      status: 'pending',
      created_by: ctx.caller.userId,
      tenant_id: ctx.caller.tenantId,
      created_at: new Date(created).toISOString(),
      expires_at: new Date(created + PROPOSAL_TTL_MS).toISOString(),
      bundle_id: bundleId,
      bundle_index: i,
    }))
    const bundle: ProposalBundle = {
      id: bundleId,
      conversationId: ctx.conversationId,
      title,
      ...(summaryText ? { summary: summaryText } : {}),
      action_ids: actions.map((a) => a.id),
      status: 'pending',
      created_by: ctx.caller.userId,
      tenant_id: ctx.caller.tenantId,
      created_at: new Date(created).toISOString(),
      expires_at: new Date(created + PROPOSAL_TTL_MS).toISOString(),
      results: [],
      stopped_at: null,
    }
    for (const a of actions) await deps.saveProposal(a)
    await deps.saveBundle(bundle)
    result.bundles++
    result.proposals += actions.length
    for (const a of actions) deps.emit({ type: 'proposal', action: a })
    deps.emit({ type: 'bundle', bundle })
    return {
      ok: true,
      content: wrapToolOutput(call.name, {
        status: 'awaiting_confirmation',
        data: {
          bundle_id: bundleId,
          title,
          steps: actions.map((a, i) => ({ step: i + 1, action_id: a.id, title: a.title })),
          note: 'Draft bundle only. Nothing has changed yet. The admin confirms the whole bundle in the app; steps then run in this order and stop at the first failure. Do not say any of it was done.',
        },
      }),
      summary: `Bundle of ${actions.length} drafts ready for your review`,
      actionIds: actions.map((a) => a.id),
      bundleId,
    }
  }
}

interface ToolOutcome {
  ok: boolean
  content: string
  summary: string
  citations?: KnowledgeHit[]
  action?: ProposedAction
  actionIds?: string[]
  bundleId?: string
  specialist?: SpecialistId
  /** The failure looked transient (worth a retry). */
  transient?: boolean
}

async function executeToolCall(
  call: ToolCall,
  deps: RunTurnDeps,
  allTools: AgentTool[],
  ctx: ToolContext,
  result: TurnResult,
  newId: () => string,
  now: Date,
  allowance: () => number,
  spend: (n: number) => void,
  onGeneration: (u: Omit<UsageEntry, 'kind'>[]) => void,
): Promise<ToolOutcome> {
  const fail = (status: string, error: string, summary: string, transient = false): ToolOutcome => ({
    ok: false,
    content: wrapToolOutput(call.name, { status, error }),
    summary,
    ...(transient ? { transient } : {}),
  })

  // Offered tools first, then anything the caller may use (e.g. a tool from earlier in the conversation).
  const tool = deps.tools.find((t) => t.name === call.name) ?? allTools.find((t) => t.name === call.name)
  if (!tool) return fail('unknown_tool', `There is no tool named ${call.name}. Use only the tools provided.`, 'Unknown tool')

  try {
    assertToolAccess(tool, ctx.caller)
  } catch (e) {
    const msg = e instanceof ToolPermissionError ? e.message : 'Permission denied'
    return fail('permission_denied', `${msg} Tell the admin this action is not available to them.`, 'Not allowed for your role')
  }

  if (typeof call.args._invalid_json === 'string') {
    return fail('invalid_arguments', 'The arguments were not valid JSON. Call the tool again with a JSON object.', 'Invalid arguments')
  }

  let args: unknown
  try {
    args = await tool.parse(call.args, ctx)
  } catch (e) {
    if (e instanceof ToolPermissionError) return fail('permission_denied', e.message, 'Not allowed')
    if (e instanceof ToolInputError) return fail('invalid_arguments', e.message, e.message.slice(0, 140) || 'Invalid arguments')
    console.error(`[agent] ${tool.name}.parse failed:`, e)
    return fail('error', 'The tool could not read these arguments.', 'Could not read the arguments', isTransientError(e))
  }

  try {
    if (tool.kind === 'read') {
      if (!tool.run) return fail('error', 'This tool cannot run.', 'Tool unavailable')
      const res = await tool.run(args as Record<string, unknown>, ctx)
      let flags: string[] = []
      if (deps.scan) {
        try { flags = deps.scan(JSON.stringify(res.data ?? null).slice(0, 50_000)).reasons } catch { /* unserialisable */ }
      }
      return {
        ok: true,
        content: wrapToolOutput(tool.name, { status: 'ok', data: res.data, flags }),
        summary: summariseToolData(res.data),
        citations: res.citations?.slice(0, 12),
      }
    }

    // Write tool: build a preview only — execute() runs from the confirm endpoint.
    if (!tool.propose) return fail('error', 'This tool cannot propose changes.', 'Tool unavailable')
    if (allowance() <= 0) {
      return fail('limit', `At most ${MAX_PROPOSALS_PER_TURN} proposals per message. Ask the admin to review the pending ones first (or use propose_bundle for a multi-part setup).`, 'Too many proposals in one message')
    }
    const metered = deps.meter
      ? await deps.meter(() => tool.propose!(args as Record<string, unknown>, ctx))
      : { value: await tool.propose(args as Record<string, unknown>, ctx), usage: [] }
    if (metered.usage.length) onGeneration(metered.usage)
    const { title, preview } = metered.value
    const created = now.getTime()
    const action: ProposedAction = {
      id: newId(),
      conversationId: ctx.conversationId,
      tool: tool.name,
      risk: tool.risk === 'none' ? 'update' : tool.risk,
      title: String(title || tool.name).slice(0, 300),
      preview: preview ?? {},
      args: (args && typeof args === 'object' ? args : {}) as Record<string, unknown>,
      status: 'pending',
      created_by: ctx.caller.userId,
      tenant_id: ctx.caller.tenantId,
      created_at: new Date(created).toISOString(),
      expires_at: new Date(created + PROPOSAL_TTL_MS).toISOString(),
    }
    await deps.saveProposal(action)
    result.proposals++
    spend(1)
    return {
      ok: true,
      content: wrapToolOutput(tool.name, {
        status: 'awaiting_confirmation',
        data: {
          action_id: action.id,
          title: action.title,
          note: 'Draft only. Nothing has changed yet. The admin must review and confirm this in the app; it expires in 24 hours. Do not say it was done, sent or saved.',
        },
      }),
      summary: 'Draft ready for your review',
      action,
    }
  } catch (e) {
    if (isAbortError(e, ctx.signal)) throw e
    if (e instanceof ToolPermissionError) return fail('permission_denied', e.message, 'Not allowed')
    if (e instanceof ToolInputError) return fail('invalid_arguments', e.message, e.message.slice(0, 140))
    console.error(`[agent] ${tool.name} failed:`, e)
    return fail('error', `The tool failed: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`, 'Something went wrong', isTransientError(e))
  }
}
