/**
 * Thin client wrapper that calls the FastAPI backend's internal AI router.
 *
 * Backend is reachable in-cluster at http://localhost:8001 (set via
 * INTERNAL_BACKEND_URL env, defaults to localhost:8001). These calls happen
 * ONLY server-side from Next.js API route handlers — never expose this from
 * the browser.
 */

const BACKEND = process.env.INTERNAL_BACKEND_URL || 'http://localhost:8001'

export interface ChatHistoryMsg {
  role: 'user' | 'assistant'
  content: string
}

interface ChatStreamArgs {
  sessionId: string
  systemMessage?: string
  history?: ChatHistoryMsg[]
  userMessage: string
  modelRole?: 'reasoning' | 'fast'
}

/**
 * Streams Server-Sent Events from the backend `/internal/ai/chat` endpoint.
 * Returns the raw upstream Response so the API route can re-stream it
 * directly to the browser with minimal overhead.
 */
export async function backendChatStream(args: ChatStreamArgs): Promise<Response> {
  const res = await fetch(`${BACKEND}/internal/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: args.sessionId,
      system_message: args.systemMessage,
      history: args.history ?? [],
      user_message: args.userMessage,
      model_role: args.modelRole ?? 'reasoning',
    }),
  })
  return res
}

export async function backendComplete(args: {
  sessionId?: string
  systemMessage: string
  userMessage: string
  modelRole?: 'reasoning' | 'fast'
  responseFormat?: 'text' | 'json'
}): Promise<{ ok: boolean; text?: string; json?: unknown; raw?: string }> {
  const res = await fetch(`${BACKEND}/internal/ai/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: args.sessionId ?? 'default',
      system_message: args.systemMessage,
      user_message: args.userMessage,
      model_role: args.modelRole ?? 'fast',
      response_format: args.responseFormat ?? 'text',
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    return { ok: false, text }
  }
  return (await res.json()) as { ok: boolean; text?: string; json?: unknown; raw?: string }
}

export async function backendPost<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BACKEND}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`backend ${path} returned ${res.status}: ${await res.text()}`)
  }
  return (await res.json()) as T
}
