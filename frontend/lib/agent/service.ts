/**
 * Server wiring for one chat turn: tools for the caller (intent-routed),
 * provider targets with fallback, budgets, rolling memory, persistence, usage
 * logging and token-based credit metering. The HTTP layer
 * (app/api/admin/agent/chat) only handles auth and streaming.
 */
import 'server-only'
import type { AgentCaller, AgentTool } from '@/lib/agent/contract'
import { toolsFor } from '@/lib/agent/tools'
import { canUseTool } from '@/lib/agent/permissions'
import { runAgentTurn, type AgentLoopEvent, type TurnResult } from '@/lib/agent/run'
import { buildHistory, makeTitle, type AgentMessageDoc } from '@/lib/agent/history'
import { chargeFor, type TurnCharge, type UsageEntry } from '@/lib/agent/metering'
import { clampSummary, planMemory, summaryPrompt } from '@/lib/agent/memory'
import { routedTools } from '@/lib/agent/specialists'
import { fallbackProvider, markTargetRateLimited, resolveProviderTargets, type ChatProvider } from '@/lib/agent/providers'
import {
  appendTurnMessage,
  appendUserMessage,
  createConversation,
  getConversation,
  loadMessages,
  saveAction,
  saveBundle,
  touchConversation,
  type AgentConversationDoc,
} from '@/lib/agent/store'
import { scopedCaller } from '@/lib/agent/scope-tenant'
import { checkBudget, getBudgetSettings, recordUsage } from '@/lib/agent/usage'
import { scanPrompt } from '@/lib/ai/prompt-guard'
import { logAiUsage } from '@/lib/ai/cost-tracking'
import { withUsageMeter, type MeteredUsage } from '@/lib/ai/usage-meter'
import { spendAiCredits } from '@/lib/user-credits'

export const MAX_USER_MESSAGE_CHARS = 8000

/** Extra stream events beyond the loop's events. */
export type AgentStreamEvent =
  | AgentLoopEvent
  | { type: 'conversation'; id: string; title: string; created: boolean; tenantId?: string | null }
  | { type: 'model'; provider: string; model: string }

/**
 * `scopeTenantId` (superadmin only, already validated): undefined keeps the
 * conversation's stored scope; null = whole platform; a string = that tenant.
 */
export async function openConversation(
  caller: AgentCaller,
  conversationId: string | null | undefined,
  firstMessage: string,
  scopeTenantId?: string | null,
): Promise<{ conv: AgentConversationDoc; created: boolean } | null> {
  const scope = caller.role === 'superadmin' ? scopeTenantId : undefined
  if (conversationId) {
    const conv = await getConversation(caller, conversationId)
    if (!conv) return null
    if (scope !== undefined && (conv.scope_tenant_id ?? null) !== scope) {
      await touchConversation(caller, conv.id, { scope_tenant_id: scope })
      conv.scope_tenant_id = scope
    }
    return { conv, created: false }
  }
  return { conv: await createConversation(caller, makeTitle(firstMessage), scope ?? null), created: true }
}

/** Run `fn` with an AI usage meter; returns its value and the metered calls. */
export async function metered<T>(fn: () => Promise<T>): Promise<{ value: T; usage: Omit<UsageEntry, 'kind'>[] }> {
  const usage: MeteredUsage[] = []
  const value = await withUsageMeter((u) => usage.push(u), fn)
  return { value, usage: usage.map((u) => ({ provider: u.provider, model: u.model, inputTokens: u.inputTokens, outputTokens: u.outputTokens })) }
}

/** Fold messages that left the history window into the conversation's rolling summary. */
async function refreshMemory(
  caller: AgentCaller,
  conv: AgentConversationDoc,
  docs: AgentMessageDoc[],
  provider: ChatProvider,
  signal: AbortSignal,
): Promise<{ summary: string | null; usage: UsageEntry[] }> {
  const plan = planMemory(docs, conv.memory_upto_seq ?? null)
  if (!plan) return { summary: conv.memory_summary ?? null, usage: [] }
  const { system, user } = summaryPrompt(conv.memory_summary, plan.toSummarise)
  let text = ''
  const usage: UsageEntry[] = []
  try {
    for await (const chunk of provider.chat({ system, messages: [{ role: 'user', content: user }], tools: [], maxTokens: 700, signal })) {
      if (chunk.type === 'text') text += chunk.delta
      else if (chunk.type === 'stop') usage.push({ provider: provider.provider, model: provider.model, inputTokens: chunk.usage.inputTokens, outputTokens: chunk.usage.outputTokens, kind: 'summary' })
    }
  } catch (e) {
    console.warn('[agent] memory summary failed (kept the previous one):', (e as Error).message)
    return { summary: conv.memory_summary ?? null, usage }
  }
  const summary = clampSummary(text)
  if (summary) {
    await touchConversation(caller, conv.id, { memory_summary: summary, memory_upto_seq: plan.uptoSeq }).catch(() => undefined)
    return { summary, usage }
  }
  return { summary: conv.memory_summary ?? null, usage }
}

export async function runChatTurn(opts: {
  caller: AgentCaller
  conv: AgentConversationDoc
  message: string
  signal: AbortSignal
  emit: (e: AgentStreamEvent) => void
  /** Interface language of the caller (lib/i18n) — passed into the system prompt. */
  locale?: 'en' | 'hi' | 'te'
}): Promise<TurnResult & { credits: number; charge: TurnCharge }> {
  const { caller, conv, message, signal, emit } = opts
  // Persistence stays keyed to the session caller; tools + knowledge act in the chosen tenant.
  const actor = scopedCaller(caller, conv.scope_tenant_id)
  const settings = await getBudgetSettings()
  const prior = await loadMessages(caller, conv.id, 400)
  const history = buildHistory(prior)
  await appendUserMessage(caller, conv.id, message)

  const allTools = toolsFor(actor).filter((t: AgentTool) => canUseTool(t, actor))
  const recent = prior.slice(-20).flatMap((d) => (d.tool_calls ?? []).map((c) => c.tool))
  const { tools } = routedTools(allTools, message, recent)
  const targets = await resolveProviderTargets(caller.userId)
  const provider = fallbackProvider(targets, { onRateLimited: markTargetRateLimited })

  let announced = ''
  const scan = scanPrompt(message)
  const logUsage = (u: { provider: string; model: string; inputTokens: number; outputTokens: number; latencyMs: number; ok: boolean }, feature: string) =>
    logAiUsage({
      userId: caller.userId,
      feature,
      provider: u.provider,
      model: u.model,
      promptTokens: u.inputTokens,
      completionTokens: u.outputTokens,
      latencyMs: u.latencyMs,
      ok: u.ok,
      injectionFlags: scan.reasons,
    })

  const memory = await refreshMemory(caller, conv, prior, provider, signal)
  for (const u of memory.usage) logUsage({ ...u, latencyMs: 0, ok: true }, 'admin_agent_memory')

  const result = await runAgentTurn(
    {
      caller: actor,
      conversationId: conv.id,
      history,
      userText: message,
      signal,
      memorySummary: memory.summary,
      locale: opts.locale,
      maxSteps: settings.max_steps_per_turn,
      maxTokensPerTurn: settings.max_tokens_per_turn,
    },
    {
      provider,
      tools,
      allTools,
      saveProposal: saveAction,
      saveBundle,
      emit: (e) => emit(e),
      onMessage: (m) => appendTurnMessage(caller, conv.id, m),
      scan: (t) => (t === message ? scan : scanPrompt(t)),
      checkBudget: async () => {
        const b = await checkBudget(actor)
        return { ok: b.ok, remaining: b.remaining, ...(b.reason ? { reason: b.reason } : {}) }
      },
      meter: metered,
      onUsage: (u) => {
        const id = `${u.provider}/${u.model}`
        if (u.ok && u.kind !== 'generation' && id !== announced) {
          announced = id
          emit({ type: 'model', provider: u.provider, model: u.model })
        }
        logUsage(u, u.kind === 'generation' ? 'admin_agent_generation' : u.kind === 'subagent' ? 'admin_agent_subagent' : 'admin_agent')
      },
    },
  )

  await touchConversation(caller, conv.id, result.model ? { last_model: `${result.provider}/${result.model}` } : {}).catch(() => undefined)

  // AGT-001: every turn pays for the tokens it actually used — ok, stopped, aborted or failed.
  const charge = chargeFor([...memory.usage, ...result.usageEntries], settings.meter)
  let credits = 0
  if (charge.credits > 0) {
    credits = charge.credits
    try {
      const spent = await spendAiCredits(caller.userId, credits)
      if (!spent.ok) {
        // Balance ran out mid-turn (parallel use) — take what is left, never go negative.
        if (spent.balance > 0) await spendAiCredits(caller.userId, spent.balance)
        credits = spent.balance > 0 ? spent.balance : 0
      }
    } catch (e) {
      console.error('[agent] credit spend failed:', e)
      credits = 0
    }
  }
  await recordUsage({ caller: actor, payerId: caller.userId, conversationId: conv.id, kind: 'turn', status: result.status, charge, creditsCharged: credits, toolCalls: result.toolCalls })
  return { ...result, credits, charge }
}

/** Charge metered AI work outside a chat turn (e.g. regenerating a draft on edit). */
export async function chargeMeteredWork(caller: AgentCaller, payerId: string, conversationId: string | null, usage: Omit<UsageEntry, 'kind'>[], kind: 'edit' | 'confirm'): Promise<number> {
  if (!usage.length) return 0
  const settings = await getBudgetSettings()
  const charge = chargeFor(usage.map((u) => ({ ...u, kind: 'generation' as const })), settings.meter)
  let credits = 0
  if (charge.credits > 0) {
    try {
      const spent = await spendAiCredits(payerId, charge.credits)
      credits = spent.ok ? charge.credits : 0
      if (!spent.ok && spent.balance > 0) {
        await spendAiCredits(payerId, spent.balance)
        credits = spent.balance
      }
    } catch (e) {
      console.error('[agent] credit spend failed:', e)
    }
  }
  await recordUsage({ caller, payerId, conversationId, kind, status: 'ok', charge, creditsCharged: credits })
  return credits
}
