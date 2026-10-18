/**
 * Tool-side additions to lib/agent/contract.ts (kept here so the shared
 * contract's exported types stay unchanged).
 */
import type { AgentTool, ToolContext } from '@/lib/agent/contract'

/**
 * Context the confirm endpoint should pass to execute(): the ProposedAction
 * id is the idempotency key (lib/agent/tools/ledger.ts). Optional — without
 * it a hash of tool + caller + conversation + args is used.
 */
export interface ToolExecuteContext extends ToolContext {
  actionId?: string
}

export interface ExecuteResult {
  ok: boolean
  message: string
  link?: string
  data?: unknown
  /** True when this is the stored result of an earlier run of the same action. */
  replayed?: boolean
}

// Tools are heterogeneous in their parsed-args type; the registry stores them erased.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = AgentTool<any>
