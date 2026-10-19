/**
 * Agent persistence — every query is scoped to the caller (owner + tenant).
 *
 * Collections:
 *   agent_conversations  { id, owner_id, tenant_id, title, created_at, updated_at, last_model?, scope_tenant_id? }
 *   agent_messages       AgentMessageDoc (lib/agent/history.ts)
 *   agent_actions        ProposedAction + updated_at / executing_at / finished_at
 */
import { getMongoDb } from '@/lib/mongodb'
import type { AgentCaller, ProposalBundle, ProposedAction } from '@/lib/agent/contract'
import type { AgentMessageDoc } from '@/lib/agent/history'
import type { TurnMessage } from '@/lib/agent/run'

export interface AgentConversationDoc {
  id: string
  owner_id: string
  tenant_id: string | null
  title: string
  created_at: string
  updated_at: string
  last_model?: string
  /** Superadmin only: the tenant the copilot was scoped to (null = whole platform). */
  scope_tenant_id?: string | null
  /** Rolling summary of messages older than the model's history window (lib/agent/memory.ts). */
  memory_summary?: string | null
  memory_upto_seq?: number | null
}

export type AgentActionDoc = ProposedAction & {
  updated_at?: string
  executing_at?: string
  finished_at?: string
}

const CONVERSATIONS = 'agent_conversations'
const MESSAGES = 'agent_messages'
const ACTIONS = 'agent_actions'
const BUNDLES = 'agent_bundles'

type Db = Awaited<ReturnType<typeof getMongoDb>>

/** Lazy index build, once per process (reset on failure so the next call retries). */
let indexesReady: Promise<unknown> | null = null
function ensureAgentIndexes(db: Db): Promise<unknown> {
  if (!indexesReady) {
    indexesReady = Promise.all([
      db.collection(CONVERSATIONS).createIndex({ owner_id: 1, tenant_id: 1, updated_at: -1 }, { name: 'agent_conv_owner_tenant_updated' }),
      db.collection(MESSAGES).createIndex({ conversation_id: 1, created_at: 1 }, { name: 'agent_msg_conv_created' }),
      db.collection(ACTIONS).createIndex({ id: 1 }, { unique: true, name: 'agent_actions_id' }),
      db.collection(ACTIONS).createIndex({ conversationId: 1 }, { name: 'agent_actions_conv' }),
      db.collection(ACTIONS).createIndex({ created_by: 1, tenant_id: 1, status: 1 }, { name: 'agent_actions_owner_status' }),
      db.collection(ACTIONS).createIndex({ expires_at: 1 }, { name: 'agent_actions_expires' }),
      db.collection(ACTIONS).createIndex({ bundle_id: 1 }, { name: 'agent_actions_bundle', sparse: true }),
      db.collection(BUNDLES).createIndex({ id: 1 }, { unique: true, name: 'agent_bundles_id' }),
      db.collection(BUNDLES).createIndex({ conversationId: 1 }, { name: 'agent_bundles_conv' }),
    ]).catch((e) => {
      indexesReady = null
      console.error('[agent] index build failed', e)
    })
  }
  return indexesReady
}

async function col<T extends object>(name: string) {
  const db = await getMongoDb()
  await ensureAgentIndexes(db)
  return db.collection<T>(name)
}

const nowIso = () => new Date().toISOString()
const newId = () => globalThis.crypto.randomUUID()

let seqCounter = 0
/** Monotonic per-process ordering key (ms × 1000 + counter). */
export function nextSeq(): number {
  seqCounter = (seqCounter + 1) % 1000
  return Date.now() * 1000 + seqCounter
}

export function scopeFilter(caller: AgentCaller) {
  return { owner_id: caller.userId, tenant_id: caller.tenantId ?? null }
}

/**
 * Superadmin proposals carry the tenant the conversation was scoped to, so a
 * superadmin's actions are matched by owner only (they are platform-wide anyway).
 */
export function actionScope(caller: AgentCaller): Record<string, unknown> {
  if (caller.role === 'superadmin') return { created_by: caller.userId }
  return { created_by: caller.userId, tenant_id: caller.tenantId ?? null }
}

const NO_ID = { projection: { _id: 0 } } as const

// ─── Conversations ──────────────────────────────────────────────────────────

export async function createConversation(caller: AgentCaller, title: string, scopeTenantId?: string | null): Promise<AgentConversationDoc> {
  const ts = nowIso()
  const doc: AgentConversationDoc = {
    id: newId(),
    ...scopeFilter(caller),
    title: title.slice(0, 120),
    created_at: ts,
    updated_at: ts,
    ...(caller.role === 'superadmin' ? { scope_tenant_id: scopeTenantId ?? null } : {}),
  }
  await (await col<AgentConversationDoc>(CONVERSATIONS)).insertOne({ ...doc })
  return doc
}

export async function getConversation(caller: AgentCaller, id: string): Promise<AgentConversationDoc | null> {
  if (!id || typeof id !== 'string') return null
  return (await (await col<AgentConversationDoc>(CONVERSATIONS)).findOne({ id, ...scopeFilter(caller) }, NO_ID)) as AgentConversationDoc | null
}

export async function listConversations(caller: AgentCaller, limit = 50): Promise<AgentConversationDoc[]> {
  const rows = await (await col<AgentConversationDoc>(CONVERSATIONS))
    .find(scopeFilter(caller), NO_ID)
    .sort({ updated_at: -1 })
    .limit(Math.min(Math.max(limit, 1), 200))
    .toArray()
  return rows as AgentConversationDoc[]
}

export async function renameConversation(caller: AgentCaller, id: string, title: string): Promise<boolean> {
  const clean = title.replace(/\s+/g, ' ').trim().slice(0, 120)
  if (!clean) return false
  const r = await (await col<AgentConversationDoc>(CONVERSATIONS)).updateOne(
    { id, ...scopeFilter(caller) },
    { $set: { title: clean, updated_at: nowIso() } },
  )
  return r.matchedCount > 0
}

export async function touchConversation(caller: AgentCaller, id: string, patch: Partial<Pick<AgentConversationDoc, 'last_model' | 'scope_tenant_id' | 'memory_summary' | 'memory_upto_seq'>> = {}) {
  await (await col<AgentConversationDoc>(CONVERSATIONS)).updateOne(
    { id, ...scopeFilter(caller) },
    { $set: { ...patch, updated_at: nowIso() } },
  )
}

/** Delete a conversation, its messages, and cancel its pending proposals. */
export async function deleteConversation(caller: AgentCaller, id: string): Promise<boolean> {
  const r = await (await col<AgentConversationDoc>(CONVERSATIONS)).deleteOne({ id, ...scopeFilter(caller) })
  if (!r.deletedCount) return false
  await (await col<AgentMessageDoc>(MESSAGES)).deleteMany({ conversation_id: id, ...scopeFilter(caller) })
  await (await col<AgentActionDoc>(ACTIONS)).updateMany(
    { conversationId: id, status: 'pending', ...actionScope(caller) },
    { $set: { status: 'cancelled', updated_at: nowIso() } },
  )
  return true
}

// ─── Messages ───────────────────────────────────────────────────────────────

export async function appendUserMessage(caller: AgentCaller, conversationId: string, content: string, extra: Partial<AgentMessageDoc> = {}) {
  const doc: AgentMessageDoc = {
    id: newId(),
    conversation_id: conversationId,
    ...scopeFilter(caller),
    seq: nextSeq(),
    role: 'user',
    content,
    created_at: nowIso(),
    ...extra,
  }
  await (await col<AgentMessageDoc>(MESSAGES)).insertOne({ ...doc })
  return doc
}

export function turnMessageToDoc(caller: AgentCaller, conversationId: string, m: TurnMessage): AgentMessageDoc {
  const base = { id: newId(), conversation_id: conversationId, ...scopeFilter(caller), seq: nextSeq(), created_at: nowIso() }
  const msg = m.message
  if (msg.role === 'assistant') {
    return {
      ...base,
      role: 'assistant',
      content: msg.content,
      ...(m.ui?.plan?.length ? { plan: m.ui.plan.map((p) => ({ id: p.id, title: p.title, ...(p.tool ? { tool: p.tool } : {}), status: p.status })) } : {}),
      ...(m.ui?.clarify ? { clarify: m.ui.clarify } : {}),
      ...(msg.toolCalls?.length
        ? { tool_calls: msg.toolCalls.map((c) => ({ id: c.id, tool: c.name, args: c.args, ...(c.meta ? { meta: c.meta } : {}) })) }
        : {}),
    }
  }
  if (msg.role === 'tool') {
    return {
      ...base,
      role: 'tool',
      content: msg.content,
      tool_call_id: msg.toolCallId,
      tool_name: msg.toolName,
      ...(msg.isError ? { is_error: true } : {}),
      ok: m.ui?.ok ?? !msg.isError,
      summary: m.ui?.summary,
      ...(m.ui?.citations?.length ? { citations: m.ui.citations } : {}),
      ...(m.ui?.actionId ? { action_id: m.ui.actionId } : {}),
      ...(m.ui?.actionIds?.length ? { action_ids: m.ui.actionIds } : {}),
      ...(m.ui?.bundleId ? { bundle_id: m.ui.bundleId } : {}),
      ...(m.ui?.specialist ? { specialist: m.ui.specialist } : {}),
      ...(m.ui?.clarify ? { clarify: m.ui.clarify } : {}),
    }
  }
  return { ...base, role: 'user', content: msg.content }
}

export async function appendTurnMessage(caller: AgentCaller, conversationId: string, m: TurnMessage) {
  await (await col<AgentMessageDoc>(MESSAGES)).insertOne(turnMessageToDoc(caller, conversationId, m))
}

export async function loadMessages(caller: AgentCaller, conversationId: string, limit = 400): Promise<AgentMessageDoc[]> {
  const rows = await (await col<AgentMessageDoc>(MESSAGES))
    .find({ conversation_id: conversationId, ...scopeFilter(caller) }, NO_ID)
    .sort({ seq: -1 })
    .limit(limit)
    .toArray()
  return (rows as AgentMessageDoc[]).reverse()
}

// ─── Actions ────────────────────────────────────────────────────────────────

export async function saveAction(action: ProposedAction): Promise<void> {
  await (await col<AgentActionDoc>(ACTIONS)).insertOne({ ...action, updated_at: action.created_at })
}

export async function getAction(caller: AgentCaller, id: string): Promise<AgentActionDoc | null> {
  if (!id || typeof id !== 'string') return null
  return (await (await col<AgentActionDoc>(ACTIONS)).findOne({ id, ...actionScope(caller) }, NO_ID)) as AgentActionDoc | null
}

export async function listActions(caller: AgentCaller, conversationId: string): Promise<AgentActionDoc[]> {
  const rows = await (await col<AgentActionDoc>(ACTIONS))
    .find({ conversationId, ...actionScope(caller) }, NO_ID)
    .sort({ created_at: 1 })
    .limit(200)
    .toArray()
  return rows as AgentActionDoc[]
}

/** Pending proposals past their 24h expiry → expired (platform-wide, idempotent). */
export async function expireStaleActions(now = new Date()): Promise<number> {
  const r = await (await col<AgentActionDoc>(ACTIONS)).updateMany(
    { status: 'pending', expires_at: { $lte: now.toISOString() } },
    { $set: { status: 'expired', updated_at: now.toISOString() } },
  )
  return r.modifiedCount ?? 0
}

/** Atomic status transition; returns the updated doc or null when `from` no longer matches. */
export async function transitionAction(
  caller: AgentCaller,
  id: string,
  from: ProposedAction['status'],
  set: Partial<AgentActionDoc>,
  extraFilter: Record<string, unknown> = {},
): Promise<AgentActionDoc | null> {
  const res = await (await col<AgentActionDoc>(ACTIONS)).findOneAndUpdate(
    { id, status: from, ...actionScope(caller), ...extraFilter },
    { $set: { ...set, updated_at: nowIso() } },
    { returnDocument: 'after', projection: { _id: 0 } },
  )
  return (res as unknown as AgentActionDoc | null) ?? null
}

// ─── Bundles ────────────────────────────────────────────────────────────────

export type AgentBundleDoc = ProposalBundle & { updated_at?: string }

/** Superadmin bundles are matched by owner (like actions); tenant admins by owner + tenant. */
function bundleScope(caller: AgentCaller): Record<string, unknown> {
  return actionScope(caller)
}

export async function saveBundle(bundle: ProposalBundle): Promise<void> {
  await (await col<AgentBundleDoc>(BUNDLES)).insertOne({ ...bundle, updated_at: bundle.created_at })
}

export async function getBundle(caller: AgentCaller, id: string): Promise<AgentBundleDoc | null> {
  if (!id || typeof id !== 'string') return null
  return (await (await col<AgentBundleDoc>(BUNDLES)).findOne({ id, ...bundleScope(caller) }, NO_ID)) as AgentBundleDoc | null
}

export async function listBundles(caller: AgentCaller, conversationId: string): Promise<AgentBundleDoc[]> {
  return (await (await col<AgentBundleDoc>(BUNDLES)).find({ conversationId, ...bundleScope(caller) }, NO_ID).sort({ created_at: 1 }).limit(50).toArray()) as AgentBundleDoc[]
}

/** Atomic bundle transition (from → set); null when the state changed underneath. */
export async function transitionBundle(
  caller: AgentCaller,
  id: string,
  from: ProposalBundle['status'] | ProposalBundle['status'][],
  set: Partial<AgentBundleDoc>,
): Promise<AgentBundleDoc | null> {
  const status = Array.isArray(from) ? { $in: from } : from
  const res = await (await col<AgentBundleDoc>(BUNDLES)).findOneAndUpdate(
    { id, status, ...bundleScope(caller) } as never,
    { $set: { ...set, updated_at: nowIso() } },
    { returnDocument: 'after', projection: { _id: 0 } },
  )
  return (res as unknown as AgentBundleDoc | null) ?? null
}

/** Executing actions older than `before` (crash recovery, AGT-003). */
export async function staleExecutingAction(caller: AgentCaller, id: string, beforeIso: string): Promise<AgentActionDoc | null> {
  return (await (await col<AgentActionDoc>(ACTIONS)).findOne({ id, status: 'executing', executing_at: { $lt: beforeIso }, ...actionScope(caller) }, NO_ID)) as AgentActionDoc | null
}
