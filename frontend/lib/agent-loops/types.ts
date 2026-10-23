/**
 * Agent loop shared types (client-safe, no I/O).
 *
 * A finding is one thing a loop noticed. When it can be fixed with one click
 * it carries a `proposal`; nothing in a proposal runs until a platform admin
 * applies it (Admin → Agent loops, or the copilot's confirm step).
 */
import type { AgentLoopId } from './registry'

export const PROPOSAL_ACTIONS = [
  'learn_unpublish', 'learn_to_draft', 'learn_add_topic', 'learn_translate',
  'news_unpublish', 'question_deactivate', 'forum_hide', 'forum_restore',
] as const
export type ProposalAction = (typeof PROPOSAL_ACTIONS)[number]

export interface Proposal {
  action: ProposalAction
  args: Record<string, string | string[] | number | boolean | null>
}

export type FindingSeverity = 'critical' | 'warning' | 'info'
export type FindingStatus = 'open' | 'applying' | 'applied' | 'dismissed' | 'failed'

export interface FindingTarget {
  type: 'learn_post' | 'news' | 'question' | 'thread' | 'reply' | 'query' | 'metric' | 'job' | 'workflow' | 'pack'
  id: string
  /** Short public label (a title or metric name) — never member post bodies. */
  label: string
  url: string | null
}

export interface FindingInput {
  /** Stable id of the problem (loop:kind:target) — re-runs refresh instead of duplicating. */
  key: string
  kind: string
  severity: FindingSeverity
  target: FindingTarget
  /** Numbers and short strings the UI / notification templates fill in. */
  params?: Record<string, string | number>
  /** Longer text the admin reads (a suggested answer, Learn links…). */
  detail?: string | null
  proposal?: Proposal | null
  tenant_id?: string | null
  /** The loop already acted (e.g. auto-hid clear spam): stored as applied. */
  status?: 'open' | 'applied'
  result?: { ok: boolean; message: string } | null
}

export interface FindingDoc extends Required<Omit<FindingInput, 'status' | 'result'>> {
  id: string
  loop: AgentLoopId
  run_id: string
  status: FindingStatus
  created_at: string
  updated_at: string
  decided_at?: string | null
  decided_by?: string | null
  result?: { ok: boolean; message: string } | null
}

export interface LoopRunDoc {
  id: string
  loop: AgentLoopId
  window: string
  trigger: 'schedule' | 'manual'
  by: string | null
  status: 'running' | 'ok' | 'error'
  started_at: string
  finished_at: string | null
  duration_ms: number
  /** Counters (scanned, flagged, proposed…). */
  summary: Record<string, number>
  /** Short codes (e.g. 'piston_unavailable', 'notified:3'). */
  notes: string[]
  ai: { calls: number; fallback: string | null }
  findings: number
  error: string | null
  expires_at?: Date
}

/** What one loop run returns to the runner. */
export interface LoopResult {
  summary: Record<string, number>
  findings: FindingInput[]
  notes?: string[]
}
