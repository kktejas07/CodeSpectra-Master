/**
 * Idempotent execution per action id. The confirm endpoint may call
 * execute() twice (double click, retry after a timeout): the first run claims
 * the key, stores its result (incl. the created object's id); later calls get
 * the same result back without doing the work again.
 *
 * Key = ctx.actionId when the confirm endpoint passes one, else the action's
 * `_nonce` (set at propose time, stored with the action's args), else a hash
 * of tool + caller + conversation + args.
 */
import { createHash } from 'crypto'
import { getMongoDb } from '@/lib/mongodb'
import { ToolInputError, ToolPermissionError, type ToolContext } from '@/lib/agent/contract'
import type { ExecuteResult, ToolExecuteContext } from './types'

export const LEDGER_COLLECTION = 'agent_tool_executions'
const STALE_RUNNING_MS = 15 * 60 * 1000

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

export function idempotencyKey(tool: string, args: unknown, ctx: ToolContext): string {
  const actionId = (ctx as ToolExecuteContext).actionId
  if (typeof actionId === 'string' && actionId) return `action:${actionId}`
  // Fresh per proposal (set by writeTool at propose time and stored with the action).
  const nonce = args && typeof args === 'object' ? (args as Record<string, unknown>)._nonce : undefined
  if (typeof nonce === 'string' && nonce) return `nonce:${ctx.caller.userId}:${nonce}`
  const h = createHash('sha256').update(`${tool}\n${ctx.caller.userId}\n${ctx.conversationId}\n${stable(args)}`).digest('hex')
  return `args:${h}`
}

let indexReady: Promise<unknown> | null = null

/**
 * Run `fn` once per key. Successful results are replayed; a failed run is
 * recorded but may be retried (nothing was created, or the service itself is
 * retry-safe — e.g. invites skip people already invited).
 */
export async function runOnce(
  tool: string,
  args: unknown,
  ctx: ToolContext,
  fn: () => Promise<ExecuteResult>,
): Promise<ExecuteResult> {
  const key = idempotencyKey(tool, args, ctx)
  const db = await getMongoDb()
  const col = db.collection(LEDGER_COLLECTION)
  if (!indexReady) indexReady = col.createIndex({ key: 1 }, { unique: true, name: 'agent_tool_exec_key' }).catch(() => {})
  await indexReady

  const now = Date.now()
  const existing = await col.findOne({ key })
  if (existing) {
    if (existing.user_id && existing.user_id !== ctx.caller.userId) {
      return { ok: false, message: 'This action belongs to another user.' }
    }
    if (existing.status === 'done' && existing.result) return { ...(existing.result as ExecuteResult), replayed: true }
    if (existing.status === 'running' && now - Number(existing.started_ms || 0) < STALE_RUNNING_MS) {
      return { ok: false, message: 'This action is already running. Check back in a moment.' }
    }
    // failed or stale: re-claim
    const claimed = await col.updateOne(
      { key, status: existing.status, started_ms: existing.started_ms },
      { $set: { status: 'running', started_ms: now, updated_at: new Date(now).toISOString() } },
    )
    if (claimed.modifiedCount === 0) return { ok: false, message: 'This action is already running. Check back in a moment.' }
  } else {
    try {
      await col.insertOne({
        key,
        tool,
        user_id: ctx.caller.userId,
        tenant_id: ctx.caller.tenantId ?? null,
        conversation_id: ctx.conversationId,
        status: 'running',
        started_ms: now,
        created_at: new Date(now).toISOString(),
      })
    } catch (e) {
      if ((e as { code?: number }).code === 11000) {
        return { ok: false, message: 'This action is already running. Check back in a moment.' }
      }
      throw e
    }
  }

  let result: ExecuteResult
  try {
    result = await fn()
  } catch (e) {
    console.error(`[agent tool ${tool}] execute failed:`, e)
    result = {
      ok: false,
      message: e instanceof ToolInputError || e instanceof ToolPermissionError ? e.message : 'Something went wrong. Try again.',
    }
  }
  await col.updateOne(
    { key },
    { $set: { status: result.ok ? 'done' : 'failed', result, updated_at: new Date().toISOString() } },
  ).catch((e) => console.error('[agent ledger] store result failed:', e))
  return result
}
