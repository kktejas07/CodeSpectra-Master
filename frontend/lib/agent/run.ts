/**
 * The admin agent's tool-calling loop (provider-agnostic, no DB or HTTP here —
 * persistence, credits and streaming are injected by the API route).
 *
 * Per turn: up to `maxSteps` model calls (default 8) and a total token cap.
 * Read tools run immediately; write tools only `propose()` — a pending
 * ProposedAction is saved and the model is told it awaits human confirmation.
 * Every call is permission-checked (roles + tenant) before parse/run.
 */
import {
  ToolInputError,
  ToolPermissionError,
  type AgentCaller,
  type AgentEvent,
  type AgentTool,
  type KnowledgeHit,
  type ProposedAction,
  type ToolContext,
} from '@/lib/agent/contract'
import { assertToolAccess } from '@/lib/agent/permissions'
import { buildSystemPrompt, summariseToolData, wrapToolOutput } from '@/lib/agent/prompt'
import type { ChatMessage, ChatProvider, ToolCall, ToolSpec } from '@/lib/agent/providers/types'

export const DEFAULT_MAX_STEPS = 8
export const DEFAULT_TURN_TOKEN_CAP = 150_000
export const DEFAULT_MAX_OUTPUT_TOKENS = 2048
export const MAX_TOOL_CALLS_PER_STEP = 6
export const MAX_PROPOSALS_PER_TURN = 5
export const PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000

export interface TurnMessage {
  message: ChatMessage
  /** UI-only facts for tool messages (never sent to the model). */
  ui?: { ok: boolean; summary: string; citations?: KnowledgeHit[]; actionId?: string }
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
}

export interface UsageRecord {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  ok: boolean
}

export interface RunTurnDeps {
  provider: ChatProvider
  /** Tools offered to the model (toolsFor(caller)); access is re-checked per call anyway. */
  tools: AgentTool[]
  saveProposal: (action: ProposedAction) => Promise<void>
  emit: (event: AgentEvent) => void
  /** Persist each message as soon as it exists (user turn is persisted by the caller). */
  onMessage?: (m: TurnMessage) => Promise<void> | void
  onUsage?: (u: UsageRecord) => void
  scan?: (text: string) => { flagged: boolean; reasons: string[] }
  newId?: () => string
}

export type TurnStatus = 'ok' | 'max_steps' | 'token_cap' | 'aborted' | 'error'

export interface TurnResult {
  status: TurnStatus
  messages: TurnMessage[]
  toolCalls: number
  proposals: number
  usage: { inputTokens: number; outputTokens: number }
  provider?: string
  model?: string
  injectionFlags: string[]
  error?: string
}

const defaultId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`)

function isAbortError(e: unknown, signal?: AbortSignal): boolean {
  return !!signal?.aborted || (e instanceof Error && e.name === 'AbortError')
}

export function toolSpecs(tools: AgentTool[]): ToolSpec[] {
  return tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }))
}

export async function runAgentTurn(input: RunTurnInput, deps: RunTurnDeps): Promise<TurnResult> {
  const maxSteps = Math.max(1, Math.min(input.maxSteps ?? DEFAULT_MAX_STEPS, 16))
  const tokenCap = input.maxTokensPerTurn ?? DEFAULT_TURN_TOKEN_CAP
  const newId = deps.newId ?? defaultId
  const now = input.now ?? new Date()
  const ctx: ToolContext = { caller: input.caller, conversationId: input.conversationId, signal: input.signal }

  const scan = deps.scan?.(input.userText) ?? { flagged: false, reasons: [] }
  const result: TurnResult = {
    status: 'ok',
    messages: [],
    toolCalls: 0,
    proposals: 0,
    usage: { inputTokens: 0, outputTokens: 0 },
    injectionFlags: scan.reasons,
  }

  const messages: ChatMessage[] = [...input.history, { role: 'user', content: input.userText }]
  const system = buildSystemPrompt({ caller: input.caller, now, tools: deps.tools, injectionFlags: scan.reasons })
  const specs = toolSpecs(deps.tools)

  const record = async (m: TurnMessage) => {
    messages.push(m.message)
    result.messages.push(m)
    try {
      await deps.onMessage?.(m)
    } catch (e) {
      console.error('[agent] failed to persist message:', e)
    }
  }

  for (let step = 0; step < maxSteps; step++) {
    if (result.usage.inputTokens + result.usage.outputTokens >= tokenCap) {
      const note = '\n\nI stopped here because this message reached its usage limit. Send another message to continue.'
      deps.emit({ type: 'text', delta: note })
      await record({ message: { role: 'assistant', content: note.trim() } })
      result.status = 'token_cap'
      return result
    }

    let text = ''
    const calls: ToolCall[] = []
    const started = Date.now()
    let stepUsage = { inputTokens: 0, outputTokens: 0 }
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
          text += chunk.delta
          deps.emit({ type: 'text', delta: chunk.delta })
        } else if (chunk.type === 'tool_call') {
          calls.push(chunk.call)
        } else if (chunk.type === 'stop') {
          stepUsage = chunk.usage
        }
      }
    } catch (e) {
      const aborted = isAbortError(e, input.signal)
      deps.onUsage?.({
        provider: result.provider ?? deps.provider.provider,
        model: result.model ?? deps.provider.model,
        inputTokens: stepUsage.inputTokens,
        outputTokens: stepUsage.outputTokens,
        latencyMs: Date.now() - started,
        ok: false,
      })
      if (text.trim()) await record({ message: { role: 'assistant', content: text } })
      result.status = aborted ? 'aborted' : 'error'
      if (!aborted) result.error = e instanceof Error ? e.message : String(e)
      return result
    }

    result.usage.inputTokens += stepUsage.inputTokens
    result.usage.outputTokens += stepUsage.outputTokens
    deps.onUsage?.({
      provider: result.provider ?? deps.provider.provider,
      model: result.model ?? deps.provider.model,
      inputTokens: stepUsage.inputTokens,
      outputTokens: stepUsage.outputTokens,
      latencyMs: Date.now() - started,
      ok: true,
    })

    const taken = calls.slice(0, MAX_TOOL_CALLS_PER_STEP)
    await record({ message: { role: 'assistant', content: text, ...(taken.length ? { toolCalls: taken } : {}) } })
    if (!taken.length) {
      result.status = 'ok'
      return result
    }

    for (const call of taken) {
      if (input.signal?.aborted) {
        result.status = 'aborted'
        return result
      }
      result.toolCalls++
      deps.emit({ type: 'tool_call', id: call.id, tool: call.name, args: call.args })
      let out: ToolOutcome
      try {
        out = await executeToolCall(call, deps, ctx, result, newId, now)
      } catch (e) {
        if (!isAbortError(e, input.signal)) throw e
        result.status = 'aborted'
        return result
      }
      await record({
        message: { role: 'tool', toolCallId: call.id, toolName: call.name, content: out.content, ...(out.ok ? {} : { isError: true }) },
        ui: { ok: out.ok, summary: out.summary, citations: out.citations, actionId: out.action?.id },
      })
      deps.emit({ type: 'tool_result', id: call.id, tool: call.name, ok: out.ok, summary: out.summary, ...(out.citations?.length ? { citations: out.citations } : {}) })
      if (out.action) deps.emit({ type: 'proposal', action: out.action })
    }
  }

  const note = `\n\nI paused after ${maxSteps} steps for this message. Say "continue" and I'll pick up where I left off.`
  deps.emit({ type: 'text', delta: note })
  await record({ message: { role: 'assistant', content: note.trim() } })
  result.status = 'max_steps'
  return result
}

interface ToolOutcome {
  ok: boolean
  content: string
  summary: string
  citations?: KnowledgeHit[]
  action?: ProposedAction
}

async function executeToolCall(
  call: ToolCall,
  deps: RunTurnDeps,
  ctx: ToolContext,
  result: TurnResult,
  newId: () => string,
  now: Date,
): Promise<ToolOutcome> {
  const fail = (status: string, error: string, summary: string): ToolOutcome => ({
    ok: false,
    content: wrapToolOutput(call.name, { status, error }),
    summary,
  })

  const tool = deps.tools.find((t) => t.name === call.name)
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
    return fail('error', 'The tool could not read these arguments.', 'Could not read the arguments')
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
    if (result.proposals >= MAX_PROPOSALS_PER_TURN) {
      return fail('limit', `At most ${MAX_PROPOSALS_PER_TURN} proposals per message. Ask the admin to review the pending ones first.`, 'Too many proposals in one message')
    }
    const { title, preview } = await tool.propose(args as Record<string, unknown>, ctx)
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
    return fail('error', `The tool failed: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`, 'Something went wrong')
  }
}
