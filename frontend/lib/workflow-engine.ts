/**
 * Workflow execution engine (v1).
 *
 * v1 scope: linear pipelines defined by `nodes` + `edges`, executed
 * depth-first from the first `trigger` node. Each step receives the
 * accumulated context (output of prior nodes keyed by node id).
 *
 * Built-in node types
 *   - trigger.manual : no-op, kicks off execution
 *   - http.request   : { url, method, headers, body }      -> fetch JSON
 *   - ai.complete    : { system, prompt }                  -> emergent LLM via backendComplete
 *   - mongo.find     : { collection, filter, limit }       -> JSON array
 *   - log            : { message }                         -> echoes message
 *   - delay          : { ms }                              -> setTimeout
 */
import { backendComplete } from '@/lib/ai/backend'
import { getMongoDb } from '@/lib/mongodb'
import type { WorkflowDoc, WorkflowNode } from '@/lib/db/leaderboard'

export interface WorkflowStepResult {
  node_id: string
  label: string
  ok: boolean
  output?: unknown
  error?: string
  duration_ms: number
}

const ALLOWED_COLLECTIONS = new Set([
  'problems',
  'submissions',
  'xp_events',
  'ai_chat_sessions',
  'ai_code_reviews',
  'github_webhook_events',
])

async function runNode(
  node: WorkflowNode,
  ctx: Record<string, unknown>,
): Promise<unknown> {
  const cfg = node.config ?? {}

  switch (node.type) {
    case 'trigger.manual':
      return { triggered: true, ts: new Date().toISOString() }

    case 'http.request': {
      const url = String(cfg.url || '')
      if (!url) throw new Error('http.request: url required')
      if (!/^https?:\/\//i.test(url)) throw new Error('http.request: only http/https URLs allowed')
      const method = String(cfg.method || 'GET').toUpperCase()
      const res = await fetch(url, {
        method,
        headers: (cfg.headers as Record<string, string>) || undefined,
        body:
          method === 'GET' || cfg.body == null
            ? undefined
            : typeof cfg.body === 'string'
              ? (cfg.body as string)
              : JSON.stringify(cfg.body),
      })
      const text = await res.text()
      let parsed: unknown = text
      try {
        parsed = JSON.parse(text)
      } catch {
        /* keep as text */
      }
      return { status: res.status, ok: res.ok, body: parsed }
    }

    case 'ai.complete': {
      const sys = String(cfg.system || 'You are a helpful assistant.')
      const prompt = String(cfg.prompt || '')
      if (!prompt) throw new Error('ai.complete: prompt required')
      const interp = prompt.replace(/\{\{(\w+)\}\}/g, (_m, key) => {
        const v = ctx[key as string]
        return typeof v === 'string' ? v : JSON.stringify(v ?? '')
      })
      const result = await backendComplete({
        sessionId: `workflow-${node.id}`,
        systemMessage: sys,
        userMessage: interp,
        modelRole: (cfg.modelRole as 'reasoning' | 'fast') || 'fast',
      })
      return result.text || result.raw || ''
    }

    case 'mongo.find': {
      const collection = String(cfg.collection || '')
      if (!ALLOWED_COLLECTIONS.has(collection)) {
        throw new Error(`mongo.find: collection "${collection}" not allowed`)
      }
      const limit = Math.min(50, Number(cfg.limit) || 10)
      const db = await getMongoDb()
      const rows = await db
        .collection(collection)
        .find((cfg.filter as Record<string, unknown>) || {}, { projection: { _id: 0 } })
        .limit(limit)
        .toArray()
      return rows
    }

    case 'log':
      return { message: String(cfg.message || '') }

    case 'delay': {
      const ms = Math.min(5000, Math.max(0, Number(cfg.ms) || 0))
      await new Promise((r) => setTimeout(r, ms))
      return { waited_ms: ms }
    }

    default:
      throw new Error(`unsupported node type: ${node.type}`)
  }
}

/**
 * Execute a workflow definition. Stops on first failure unless a node
 * sets `continue_on_error` in its config.
 */
export async function executeWorkflow(
  wf: WorkflowDoc,
): Promise<{
  status: 'success' | 'failed' | 'partial'
  steps: WorkflowStepResult[]
  duration_ms: number
}> {
  const started = Date.now()
  const steps: WorkflowStepResult[] = []
  const ctx: Record<string, unknown> = {}

  // Topological-ish order: walk edges from first trigger; fall back to declared order.
  const order = orderNodes(wf)
  let failed = false
  let anySuccess = false

  for (const node of order) {
    const t0 = Date.now()
    try {
      const out = await runNode(node, ctx)
      ctx[node.id] = out
      steps.push({
        node_id: node.id,
        label: node.label || node.type,
        ok: true,
        output: out,
        duration_ms: Date.now() - t0,
      })
      anySuccess = true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      steps.push({
        node_id: node.id,
        label: node.label || node.type,
        ok: false,
        error: msg,
        duration_ms: Date.now() - t0,
      })
      failed = true
      if (!node.config?.continue_on_error) break
    }
  }

  const duration_ms = Date.now() - started
  const status: 'success' | 'failed' | 'partial' = failed
    ? anySuccess
      ? 'partial'
      : 'failed'
    : 'success'
  return { status, steps, duration_ms }
}

function orderNodes(wf: WorkflowDoc): WorkflowNode[] {
  if (!wf.edges?.length) return wf.nodes
  const byId = new Map(wf.nodes.map((n) => [n.id, n]))
  const incoming = new Map<string, number>()
  for (const n of wf.nodes) incoming.set(n.id, 0)
  for (const e of wf.edges) {
    incoming.set(e.to, (incoming.get(e.to) || 0) + 1)
  }
  // Start with nodes that have no incoming edges.
  const queue: string[] = wf.nodes.filter((n) => (incoming.get(n.id) || 0) === 0).map((n) => n.id)
  const ordered: WorkflowNode[] = []
  const seen = new Set<string>()

  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    const node = byId.get(id)
    if (node) ordered.push(node)
    for (const e of wf.edges) {
      if (e.from === id && !seen.has(e.to)) queue.push(e.to)
    }
  }
  // Append unreferenced nodes at the end (best-effort).
  for (const n of wf.nodes) if (!seen.has(n.id)) ordered.push(n)
  return ordered
}
