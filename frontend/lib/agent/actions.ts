/**
 * ProposedAction lifecycle: confirm (pending → executing → done | failed),
 * cancel, edit (re-propose with new args) and expiry.
 *
 * Callers pass a caller freshly built from the server session (re-auth). The
 * action must belong to that caller (owner + tenant); the tool's roles are
 * re-checked and the stored args re-validated with tool.parse before
 * execute(). The executing claim is an atomic conditional update, so a double
 * click or a retried request runs execute() at most once per action id.
 */
import {
  ToolInputError,
  ToolPermissionError,
  type AgentCaller,
  type AgentTool,
  type ProposedAction,
  type ToolContext,
} from '@/lib/agent/contract'
import { assertToolAccess } from '@/lib/agent/permissions'
import { actionUpdateNote } from '@/lib/agent/history'
import { PROPOSAL_TTL_MS } from '@/lib/agent/run'
import {
  appendUserMessage,
  expireStaleActions,
  getAction,
  transitionAction,
  touchConversation,
  type AgentActionDoc,
} from '@/lib/agent/store'

export interface ActionDeps {
  getTool: (name: string) => AgentTool | undefined
  audit?: (actor: { id: string }, action: string, resource: string, detail: string, severity: 'info' | 'warning' | 'critical') => Promise<void>
  now?: () => Date
}

export type ActionOutcome =
  | { ok: true; status: 200; action: ProposedAction; replayed?: boolean }
  | { ok: false; status: 400 | 403 | 404 | 409 | 410 | 422; error: string; action?: ProposedAction }

function strip(doc: AgentActionDoc): ProposedAction {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { updated_at, executing_at, finished_at, ...rest } = doc as AgentActionDoc & { _id?: unknown }
  delete (rest as { _id?: unknown })._id
  return rest
}

const isExpired = (a: ProposedAction, now: Date) => a.status === 'pending' && Date.parse(a.expires_at) <= now.getTime()

async function noteInConversation(caller: AgentCaller, a: ProposedAction) {
  try {
    await appendUserMessage(caller, a.conversationId, actionUpdateNote(a), { kind: 'action_update', hidden: true, action_id: a.id })
    await touchConversation(caller, a.conversationId)
  } catch (e) {
    console.error('[agent] could not note action update:', e)
  }
}

/** Load, expire if due, and classify a non-pending state. */
async function loadPending(caller: AgentCaller, id: string, now: Date): Promise<{ doc: AgentActionDoc } | ActionOutcome> {
  await expireStaleActions(now).catch(() => 0)
  const doc = await getAction(caller, id)
  if (!doc) return { ok: false, status: 404, error: 'This proposal was not found.' }
  if (isExpired(doc, now)) {
    const exp = await transitionAction(caller, id, 'pending', { status: 'expired' })
    return { ok: false, status: 410, error: 'This proposal expired. Ask the copilot to draft it again.', action: strip(exp ?? { ...doc, status: 'expired' }) }
  }
  if (doc.status === 'pending') return { doc }
  const action = strip(doc)
  switch (doc.status) {
    case 'expired': return { ok: false, status: 410, error: 'This proposal expired. Ask the copilot to draft it again.', action }
    case 'cancelled': return { ok: false, status: 409, error: 'This proposal was cancelled.', action }
    case 'executing':
    case 'confirmed': return { ok: false, status: 409, error: 'This proposal is already running.', action }
    default: return { ok: false, status: 409, error: 'This proposal was already handled.', action }
  }
}

function resolveTool(deps: ActionDeps, name: string): AgentTool | null {
  const tool = deps.getTool(name)
  if (!tool || tool.kind !== 'write' || !tool.execute) return null
  return tool
}

export async function confirmAction(caller: AgentCaller, id: string, deps: ActionDeps): Promise<ActionOutcome> {
  const now = deps.now?.() ?? new Date()
  await expireStaleActions(now).catch(() => 0)
  const existing = await getAction(caller, id)
  // Idempotent replay: a finished action returns its stored result.
  if (existing && (existing.status === 'done' || existing.status === 'failed')) {
    return { ok: true, status: 200, action: strip(existing), replayed: true }
  }
  const loaded = await loadPending(caller, id, now)
  if (!('doc' in loaded)) return loaded
  const doc = loaded.doc

  const tool = resolveTool(deps, doc.tool)
  if (!tool) return { ok: false, status: 400, error: 'This action is no longer available.', action: strip(doc) }
  try {
    assertToolAccess(tool, caller)
  } catch (e) {
    return { ok: false, status: 403, error: e instanceof Error ? e.message : 'Not allowed', action: strip(doc) }
  }

  const ctx: ToolContext = { caller, conversationId: doc.conversationId }
  let args: Record<string, unknown>
  try {
    args = (await tool.parse(doc.args, ctx)) as Record<string, unknown>
  } catch (e) {
    if (e instanceof ToolPermissionError) return { ok: false, status: 403, error: e.message, action: strip(doc) }
    const msg = e instanceof ToolInputError ? e.message : 'The saved details are no longer valid.'
    return { ok: false, status: 422, error: `${msg} Edit the proposal and try again.`, action: strip(doc) }
  }

  const claimed = await transitionAction(
    caller,
    id,
    'pending',
    { status: 'executing', executing_at: now.toISOString() },
    { expires_at: { $gt: now.toISOString() } },
  )
  if (!claimed) {
    // Lost a race (double click / retry) — report whatever state won.
    const cur = await getAction(caller, id)
    if (cur && (cur.status === 'done' || cur.status === 'failed')) return { ok: true, status: 200, action: strip(cur), replayed: true }
    return { ok: false, status: 409, error: 'This proposal is already being handled.', ...(cur ? { action: strip(cur) } : {}) }
  }

  let result: NonNullable<ProposedAction['result']>
  try {
    const r = await tool.execute!(args, ctx)
    result = { ok: !!r.ok, message: String(r.message || (r.ok ? 'Done' : 'Failed')).slice(0, 500), ...(r.link ? { link: r.link } : {}), ...(r.data !== undefined ? { data: r.data } : {}) }
  } catch (e) {
    console.error(`[agent] execute ${doc.tool} failed:`, e)
    const msg = e instanceof ToolPermissionError || e instanceof ToolInputError ? e.message : 'Something went wrong while doing this.'
    result = { ok: false, message: msg.slice(0, 500) }
  }
  const finalStatus = result.ok ? 'done' : 'failed'
  const finished = (await transitionAction(caller, id, 'executing', { status: finalStatus, result, finished_at: new Date().toISOString() }))
    ?? { ...claimed, status: finalStatus, result }
  const action = strip(finished)

  if (deps.audit) {
    const severity = result.ok ? (['delete', 'money', 'publish'].includes(doc.risk) ? 'warning' : 'info') : 'warning'
    await deps.audit({ id: caller.userId }, `agent.action.${finalStatus}`, id, `${doc.tool}: ${doc.title} — ${result.message}`, severity).catch(() => undefined)
  }
  await noteInConversation(caller, action)
  return { ok: true, status: 200, action }
}

export async function cancelAction(caller: AgentCaller, id: string, deps: Pick<ActionDeps, 'audit' | 'now'> = {}): Promise<ActionOutcome> {
  const now = deps.now?.() ?? new Date()
  const existing = await getAction(caller, id)
  if (existing?.status === 'cancelled') return { ok: true, status: 200, action: strip(existing), replayed: true }
  const loaded = await loadPending(caller, id, now)
  if (!('doc' in loaded)) return loaded
  const done = await transitionAction(caller, id, 'pending', { status: 'cancelled' })
  if (!done) {
    const cur = await getAction(caller, id)
    return { ok: false, status: 409, error: 'This proposal is already being handled.', ...(cur ? { action: strip(cur) } : {}) }
  }
  const action = strip(done)
  await deps.audit?.({ id: caller.userId }, 'agent.action.cancelled', id, `${action.tool}: ${action.title}`, 'info').catch(() => undefined)
  await noteInConversation(caller, action)
  return { ok: true, status: 200, action }
}

/** Replace the args of a pending proposal and rebuild its preview with propose(). */
export async function editAction(caller: AgentCaller, id: string, rawArgs: unknown, deps: ActionDeps): Promise<ActionOutcome> {
  const now = deps.now?.() ?? new Date()
  const loaded = await loadPending(caller, id, now)
  if (!('doc' in loaded)) return loaded
  const doc = loaded.doc
  const tool = deps.getTool(doc.tool)
  if (!tool || tool.kind !== 'write' || !tool.propose) return { ok: false, status: 400, error: 'This action can no longer be edited.', action: strip(doc) }
  try {
    assertToolAccess(tool, caller)
  } catch (e) {
    return { ok: false, status: 403, error: e instanceof Error ? e.message : 'Not allowed', action: strip(doc) }
  }
  if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) {
    return { ok: false, status: 422, error: 'Details must be an object.', action: strip(doc) }
  }
  const ctx: ToolContext = { caller, conversationId: doc.conversationId }
  let args: Record<string, unknown>
  let preview: { title: string; preview: Record<string, unknown> }
  try {
    args = (await tool.parse(rawArgs, ctx)) as Record<string, unknown>
    preview = await tool.propose(args, ctx)
  } catch (e) {
    if (e instanceof ToolPermissionError) return { ok: false, status: 403, error: e.message, action: strip(doc) }
    const msg = e instanceof ToolInputError ? e.message : 'These details could not be used.'
    return { ok: false, status: 422, error: msg, action: strip(doc) }
  }
  const updated = await transitionAction(caller, id, 'pending', {
    args,
    title: String(preview.title || doc.title).slice(0, 300),
    preview: preview.preview ?? {},
    expires_at: new Date(now.getTime() + PROPOSAL_TTL_MS).toISOString(),
  })
  if (!updated) {
    const cur = await getAction(caller, id)
    return { ok: false, status: 409, error: 'This proposal changed while you were editing it.', ...(cur ? { action: strip(cur) } : {}) }
  }
  return { ok: true, status: 200, action: strip(updated) }
}
