import type { KnowledgeHit, ProposedAction } from '@/lib/agent/contract'

export interface ConversationSummary {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export type UiPart =
  | { type: 'text'; text: string }
  | {
      type: 'step'
      id: string
      tool: string
      args: unknown
      status: 'running' | 'ok' | 'error'
      summary?: string
      citations?: KnowledgeHit[]
      actionId?: string
    }

export type UiItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; parts: UiPart[]; error?: string; streaming?: boolean }

/** Stored message as returned by GET /api/admin/agent/conversations/[id]. */
export interface StoredMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: { id: string; tool: string; args: unknown }[]
  tool_call_id?: string
  tool_name?: string
  ok?: boolean
  summary?: string
  citations?: KnowledgeHit[]
  action_id?: string
  created_at: string
}

export type ActionMap = Record<string, ProposedAction>

export interface AgentStatus {
  model: { provider: string; model: string } | null
  credits: { balance: number; allowance: number; resets_at: string | null } | null
  pricing?: string
}
