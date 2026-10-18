/**
 * Server wiring for one chat turn: tools for the caller, provider targets
 * with fallback, persistence, usage logging and the per-turn credit charge.
 * The HTTP layer (app/api/admin/agent/chat) only handles auth and streaming.
 */
import 'server-only'
import type { AgentCaller, AgentEvent, AgentTool } from '@/lib/agent/contract'
import { toolsFor } from '@/lib/agent/tools'
import { canUseTool } from '@/lib/agent/permissions'
import { runAgentTurn, type TurnResult } from '@/lib/agent/run'
import { buildHistory, makeTitle } from '@/lib/agent/history'
import { creditsForTurn } from '@/lib/agent/credits'
import { fallbackProvider, markTargetRateLimited, resolveProviderTargets } from '@/lib/agent/providers'
import {
  appendTurnMessage,
  appendUserMessage,
  createConversation,
  getConversation,
  loadMessages,
  saveAction,
  touchConversation,
  type AgentConversationDoc,
} from '@/lib/agent/store'
import { scanPrompt } from '@/lib/ai/prompt-guard'
import { logAiUsage } from '@/lib/ai/cost-tracking'
import { spendAiCredits } from '@/lib/user-credits'

export const MAX_USER_MESSAGE_CHARS = 8000

/** Extra stream events beyond the contract's AgentEvent. */
export type AgentStreamEvent =
  | AgentEvent
  | { type: 'conversation'; id: string; title: string; created: boolean }
  | { type: 'model'; provider: string; model: string }

export async function openConversation(caller: AgentCaller, conversationId: string | null | undefined, firstMessage: string): Promise<{ conv: AgentConversationDoc; created: boolean } | null> {
  if (conversationId) {
    const conv = await getConversation(caller, conversationId)
    return conv ? { conv, created: false } : null
  }
  return { conv: await createConversation(caller, makeTitle(firstMessage)), created: true }
}

export async function runChatTurn(opts: {
  caller: AgentCaller
  conv: AgentConversationDoc
  message: string
  signal: AbortSignal
  emit: (e: AgentStreamEvent) => void
}): Promise<TurnResult & { credits: number }> {
  const { caller, conv, message, signal, emit } = opts
  const prior = await loadMessages(caller, conv.id, 200)
  const history = buildHistory(prior)
  await appendUserMessage(caller, conv.id, message)

  const tools = toolsFor(caller).filter((t: AgentTool) => canUseTool(t, caller))
  const targets = await resolveProviderTargets(caller.userId)
  const provider = fallbackProvider(targets, { onRateLimited: markTargetRateLimited })

  let announced = ''
  const scan = scanPrompt(message)
  const result = await runAgentTurn(
    { caller, conversationId: conv.id, history, userText: message, signal },
    {
      provider,
      tools,
      saveProposal: saveAction,
      emit: (e) => emit(e),
      onMessage: (m) => appendTurnMessage(caller, conv.id, m),
      scan: (t) => (t === message ? scan : scanPrompt(t)),
      onUsage: (u) => {
        const id = `${u.provider}/${u.model}`
        if (u.ok && id !== announced) {
          announced = id
          emit({ type: 'model', provider: u.provider, model: u.model })
        }
        logAiUsage({
          userId: caller.userId,
          feature: 'admin_agent',
          provider: u.provider,
          model: u.model,
          promptTokens: u.inputTokens,
          completionTokens: u.outputTokens,
          latencyMs: u.latencyMs,
          ok: u.ok,
          injectionFlags: scan.reasons,
        })
      },
    },
  )

  await touchConversation(caller, conv.id, result.model ? { last_model: `${result.provider}/${result.model}` } : {}).catch(() => undefined)

  // Credits: only a completed turn is charged (see lib/agent/credits.ts).
  let credits = 0
  if (result.status === 'ok' || result.status === 'max_steps' || result.status === 'token_cap') {
    credits = creditsForTurn(result.toolCalls)
    try {
      const spent = await spendAiCredits(caller.userId, credits)
      if (!spent.ok) {
        // Balance dropped mid-turn (parallel use) — take what is left, never go negative.
        if (spent.balance > 0) await spendAiCredits(caller.userId, spent.balance)
        credits = spent.balance > 0 ? spent.balance : 0
      }
    } catch (e) {
      console.error('[agent] credit spend failed:', e)
      credits = 0
    }
  }
  return { ...result, credits }
}
