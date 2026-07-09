/**
 * Thin client wrapper that calls the FastAPI backend's internal AI router.
 *
 * Backend is reachable in-cluster at http://localhost:8001 (set via
 * INTERNAL_BACKEND_URL env, defaults to localhost:8001). These calls happen
 * ONLY server-side from Next.js API route handlers — never expose this from
 * the browser.
 */

const BACKEND = process.env.INTERNAL_BACKEND_URL || 'http://localhost:8001'

async function getBackendSecrets(): Promise<{
  anthropic: string; gemini: string; openai: string
}> {
  const fromEnv = {
    anthropic: process.env.ANTHROPIC_API_KEY?.trim() || '',
    gemini: process.env.GEMINI_API_KEY?.trim() || '',
    openai: process.env.OPENAI_API_KEY?.trim() || '',
  }
  // If env vars are set, use them directly (no need to read DB)
  if (fromEnv.anthropic || fromEnv.gemini) return fromEnv
  try {
    const { readServerSecrets } = await import('@/lib/server-secrets-cache')
    const secrets = await readServerSecrets()
    return {
      anthropic: secrets.anthropic_api_key?.trim() || '',
      gemini: secrets.gemini_api_key?.trim() || '',
      openai: secrets.openai_api_key?.trim() || '',
    }
  } catch {
    return fromEnv
  }
}

async function backendHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const keys = await getBackendSecrets()
  // Pass all available keys as headers — backend picks the right one per provider
  if (keys.anthropic) h['x-anthropic-api-key'] = keys.anthropic
  if (keys.gemini) h['x-gemini-api-key'] = keys.gemini
  if (keys.openai) h['x-openai-api-key'] = keys.openai
  return h
}

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
  providerOverride?: string
  modelOverride?: string
}

/**
 * Streams Server-Sent Events from the backend `/internal/ai/chat` endpoint.
 * Returns the raw upstream Response so the API route can re-stream it
 * directly to the browser with minimal overhead.
 */
export async function backendChatStream(args: ChatStreamArgs): Promise<Response> {
  const headers = await backendHeaders()
  const res = await fetch(`${BACKEND}/internal/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      session_id: args.sessionId,
      system_message: args.systemMessage,
      history: args.history ?? [],
      user_message: args.userMessage,
      model_role: args.modelRole ?? 'reasoning',
      ...(args.providerOverride && args.modelOverride ? {
        provider_override: args.providerOverride,
        model_override: args.modelOverride,
      } : {}),
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
  providerOverride?: string
  modelOverride?: string
}): Promise<{ ok: boolean; text?: string; json?: unknown; raw?: string }> {
  const headers = await backendHeaders()
  const res = await fetch(`${BACKEND}/internal/ai/complete`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      session_id: args.sessionId ?? 'default',
      system_message: args.systemMessage,
      user_message: args.userMessage,
      model_role: args.modelRole ?? 'fast',
      response_format: args.responseFormat ?? 'text',
      ...(args.providerOverride && args.modelOverride ? {
        provider_override: args.providerOverride,
        model_override: args.modelOverride,
      } : {}),
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    return { ok: false, text }
  }
  return (await res.json()) as { ok: boolean; text?: string; json?: unknown; raw?: string }
}

export async function backendPost<T = unknown>(
  path: string,
  body: unknown,
  opts?: { providerOverride?: string; modelOverride?: string; modelRole?: 'reasoning' | 'fast' },
): Promise<T> {
  const headers = await backendHeaders()
  const res = await fetch(`${BACKEND}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...(body as object),
      ...(opts?.providerOverride && opts?.modelOverride ? {
        provider_override: opts.providerOverride,
        model_override: opts.modelOverride,
        model_role: opts.modelRole ?? 'reasoning',
      } : {}),
    }),
  })
  if (!res.ok) {
    throw new Error(`backend ${path} returned ${res.status}: ${await res.text()}`)
  }
  return (await res.json()) as T
}
