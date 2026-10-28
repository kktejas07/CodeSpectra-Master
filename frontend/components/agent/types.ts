import type { KnowledgeHit, ProposalBundle, ProposedAction } from '@/lib/agent/contract'
import type { PlanStep } from '@/lib/agent/run'

export type { PlanStep }

export interface ConversationSummary {
  id: string
  title: string
  created_at: string
  updated_at: string
  /** Superadmin only: the organisation the conversation is scoped to (null = whole platform). */
  tenant_id?: string | null
}

export interface UiStep {
  type: 'step'
  id: string
  tool: string
  args: unknown
  status: 'running' | 'ok' | 'error'
  summary?: string
  citations?: KnowledgeHit[]
  actionId?: string
  /** Drafts created by a sub-agent / bundle under this step. */
  actionIds?: string[]
  bundleId?: string
  /** delegate_to_specialist: the specialist and its own steps. */
  agent?: { id: string; label: string; task?: string }
  children?: UiStep[]
  /** Transient-error retries seen for this step. */
  retries?: number
}

export type UiPart =
  | { type: 'text'; text: string }
  | UiStep
  | { type: 'clarify'; id: string; question: string; options?: string[] }

export type UiItem =
  | { kind: 'user'; id: string; text: string }
  | {
      kind: 'assistant'
      id: string
      parts: UiPart[]
      error?: string
      streaming?: boolean
      /** The plan checklist (ticked off as tools finish). */
      plan?: PlanStep[]
      /** Self-check asked the model to revise its answer. */
      revised?: boolean
    }

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
  action_ids?: string[]
  bundle_id?: string
  specialist?: string
  plan?: PlanStep[]
  clarify?: { question: string; options?: string[] }
  created_at: string
}

export type ActionMap = Record<string, ProposedAction>
export type BundleMap = Record<string, ProposalBundle>

export interface AgentStatus {
  model: { provider: string; model: string } | null
  credits: { balance: number; allowance: number; resets_at: string | null } | null
  pricing?: string
  role?: 'superadmin' | 'tenant_admin'
  budget?: { ok: boolean; daily: { used: number; limit: number }; monthly: { used: number; limit: number } } | null
}
