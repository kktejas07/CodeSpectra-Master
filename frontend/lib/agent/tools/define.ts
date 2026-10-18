/**
 * Tool builders: every tool re-checks the caller (role + tenant) in each
 * phase, read output is trimmed for the model, and write execution goes
 * through the per-action idempotency ledger.
 */
import { randomUUID } from 'crypto'
import type { AgentRole, AgentTool, JsonSchema, ToolContext, ToolResult, ToolRisk } from '@/lib/agent/contract'
import { ADMIN_ROLES, assertCaller } from './scope'
import { fitForModel } from './output'
import { runOnce } from './ledger'
import { DRAFT_KEY } from './seal'
import type { ExecuteResult } from './types'

/** Per-action nonce set at propose time; the idempotency key when no action id is passed. */
export const NONCE_KEY = '_nonce'

/** Reserved keys the wrapper carries through parse → stored args → parse again. */
type Reserved = { [DRAFT_KEY]?: unknown; [NONCE_KEY]?: string }

interface Base<A> {
  name: string
  description: string
  parameters: JsonSchema
  roles?: AgentRole[]
  parse(raw: unknown, ctx: ToolContext): A | Promise<A>
}

export function readTool<A>(def: Base<A> & { run(args: A, ctx: ToolContext): Promise<ToolResult> }): AgentTool<A> {
  const roles = def.roles ?? ADMIN_ROLES
  const tool: AgentTool<A> = {
    name: def.name,
    description: def.description,
    kind: 'read',
    risk: 'none',
    parameters: def.parameters,
    roles,
    parse(raw, ctx) {
      assertCaller(tool, ctx.caller)
      return def.parse(raw, ctx)
    },
    async run(args, ctx) {
      assertCaller(tool, ctx.caller)
      const res = await def.run(args, ctx)
      return { ...res, data: fitForModel(res.data) }
    },
  }
  return tool
}

/**
 * Write tools. parse() must return args in the SAME shape as its input (the
 * runtime stores the parsed args on the action and parses them again on
 * confirm / edit), so parsed args use the schema's own keys.
 *
 * The wrapper owns two reserved keys:
 *  - `_draft`  sealed preview data (lib/agent/tools/seal.ts); dropped at
 *              propose time and re-attached only by the tool itself.
 *  - `_nonce`  fresh per proposal; the idempotency key (ledger) so two
 *              separate actions with identical args never replay each other.
 */
export function writeTool<A extends object>(def: Base<A> & {
  risk: Exclude<ToolRisk, 'none'>
  /** Must not write. May read and may call AI (no persistence). May set args._draft via sealDraft. */
  propose(args: A & Reserved, ctx: ToolContext): Promise<{ title: string; preview: Record<string, unknown> }>
  /** Runs after confirmation; must call the same service the UI/API uses. */
  execute(args: A & Reserved, ctx: ToolContext): Promise<ExecuteResult>
}): AgentTool<A & Reserved> {
  const roles = def.roles ?? ADMIN_ROLES
  const tool: AgentTool<A & Reserved> = {
    name: def.name,
    description: def.description,
    kind: 'write',
    risk: def.risk,
    parameters: def.parameters,
    roles,
    async parse(raw, ctx) {
      assertCaller(tool, ctx.caller)
      let rest: unknown = raw
      const reserved: Reserved = {}
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const { [DRAFT_KEY]: draft, [NONCE_KEY]: nonce, ...others } = raw as Record<string, unknown>
        rest = others
        if (draft !== undefined) reserved[DRAFT_KEY] = draft
        if (typeof nonce === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(nonce)) reserved[NONCE_KEY] = nonce
      }
      const parsed = await def.parse(rest, ctx)
      return { ...parsed, ...reserved } as A & Reserved
    },
    async propose(args, ctx) {
      assertCaller(tool, ctx.caller)
      // A proposal never trusts a draft or nonce that came with the arguments.
      const a = args as Record<string, unknown>
      delete a[DRAFT_KEY]
      a[NONCE_KEY] = randomUUID()
      return def.propose(args, ctx)
    },
    async execute(args, ctx) {
      // Re-check on confirm: the caller is rebuilt from the session by the confirm endpoint.
      assertCaller(tool, ctx.caller)
      return runOnce(def.name, args, ctx, () => def.execute(args, ctx))
    },
  }
  return tool
}
