/**
 * Provider-agnostic embeddings on the platform keys (lib/ai/get-api-key).
 *
 * Chain: OpenAI text-embedding-3-small → OpenRouter openai/text-embedding-3-small
 * (same vectors, recorded under one model name) → Gemini text-embedding-004.
 * Batched, retried with exponential backoff on 429/5xx; 429 marks the key
 * rate-limited so round-robin moves on. Every vector is stored with its model
 * name + dims, and search only compares vectors of the same model.
 *
 * No provider configured → callers index text only (keyword search still works).
 */
import { getApiKey, markRateLimited, trackAiUsage, type ProviderId } from '@/lib/ai/get-api-key'

export const OPENAI_EMBED_MODEL = 'text-embedding-3-small'
export const GEMINI_EMBED_MODEL = 'text-embedding-004'

export const EMBED_MODELS: Record<string, { dims: number }> = {
  [OPENAI_EMBED_MODEL]: { dims: 1536 },
  [GEMINI_EMBED_MODEL]: { dims: 768 },
}

const BATCH = 64
const MAX_INPUT_CHARS = 8000
const MAX_RETRIES = 3

export interface EmbedResult {
  model: string
  dims: number
  vectors: number[][]
}

type Backend = {
  model: string
  providers: ProviderId[]
  call: (provider: ProviderId, key: string, inputs: string[]) => Promise<Response>
  parse: (json: unknown) => number[][]
}

const OPENAI_BACKEND: Backend = {
  model: OPENAI_EMBED_MODEL,
  providers: ['openai', 'openrouter'],
  call: (provider, key, inputs) =>
    fetch(provider === 'openai' ? 'https://api.openai.com/v1/embeddings' : 'https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: provider === 'openai' ? OPENAI_EMBED_MODEL : `openai/${OPENAI_EMBED_MODEL}`, input: inputs }),
      signal: AbortSignal.timeout(60_000),
    }),
  parse: (json) => {
    const data = (json as { data?: { index?: number; embedding?: number[] }[] })?.data ?? []
    return [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((d) => d.embedding ?? [])
  },
}

const GEMINI_BACKEND: Backend = {
  model: GEMINI_EMBED_MODEL,
  providers: ['gemini'],
  call: (_provider, key, inputs) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBED_MODEL}:batchEmbedContents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        requests: inputs.map((text) => ({ model: `models/${GEMINI_EMBED_MODEL}`, content: { parts: [{ text }] } })),
      }),
      signal: AbortSignal.timeout(60_000),
    }),
  parse: (json) => ((json as { embeddings?: { values?: number[] }[] })?.embeddings ?? []).map((e) => e.values ?? []),
}

const BACKENDS: Backend[] = [OPENAI_BACKEND, GEMINI_BACKEND]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

class EmbedHttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

async function callWithRetry(b: Backend, provider: ProviderId, key: string, inputs: string[]): Promise<number[][]> {
  let lastErr: unknown
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await b.call(provider, key, inputs)
      if (res.ok) {
        const vectors = b.parse(await res.json())
        if (vectors.length !== inputs.length || vectors.some((v) => !Array.isArray(v) || v.length === 0)) {
          throw new EmbedHttpError(502, 'Embedding response did not match the input batch')
        }
        return vectors
      }
      const body = (await res.text().catch(() => '')).slice(0, 200)
      if (res.status === 429) await markRateLimited(provider, key, 60_000)
      // Auth / bad request errors won't fix themselves on retry.
      if (res.status !== 429 && res.status < 500) throw new EmbedHttpError(res.status, `Embedding failed (${res.status}): ${body}`)
      lastErr = new EmbedHttpError(res.status, `Embedding failed (${res.status}): ${body}`)
    } catch (e) {
      if (e instanceof EmbedHttpError && e.status !== 429 && e.status < 500) throw e
      lastErr = e
    }
    await sleep(500 * 2 ** attempt + Math.floor(Math.random() * 250))
  }
  throw lastErr instanceof Error ? lastErr : new Error('Embedding failed')
}

async function backendKey(b: Backend): Promise<{ provider: ProviderId; key: string } | null> {
  for (const p of b.providers) {
    const k = await getApiKey(p)
    if (k?.key) return { provider: p, key: k.key }
  }
  return null
}

/** Models that can be produced right now, in preference order. */
export async function availableEmbedModels(): Promise<string[]> {
  const out: string[] = []
  for (const b of BACKENDS) if (await backendKey(b)) out.push(b.model)
  return out
}

/**
 * Embed `texts` with the first available backend (or one of `preferModels`
 * first, e.g. the model the corpus already uses). Returns null when no
 * provider is configured or every provider failed.
 */
export async function embedTexts(
  texts: string[],
  opts: { preferModels?: string[]; feature?: string; userId?: string } = {},
): Promise<EmbedResult | null> {
  if (!texts.length) return null
  const order = [
    ...(opts.preferModels ?? []).map((m) => BACKENDS.find((b) => b.model === m)).filter((b): b is Backend => !!b),
    ...BACKENDS,
  ].filter((b, i, arr) => arr.indexOf(b) === i)

  for (const b of order) {
    const auth = await backendKey(b)
    if (!auth) continue
    const started = Date.now()
    try {
      const vectors: number[][] = []
      for (let i = 0; i < texts.length; i += BATCH) {
        const batch = texts.slice(i, i + BATCH).map((t) => (t || ' ').slice(0, MAX_INPUT_CHARS))
        vectors.push(...(await callWithRetry(b, auth.provider, auth.key, batch)))
      }
      const dims = vectors[0]?.length ?? 0
      if (vectors.some((v) => v.length !== dims)) throw new Error('Mixed embedding dimensions in one response')
      void trackAiUsage({
        user_id: opts.userId,
        feature: opts.feature ?? 'rag_embed',
        provider: auth.provider,
        model: b.model,
        input_tokens: Math.ceil(texts.reduce((n, t) => n + Math.min(t.length, MAX_INPUT_CHARS), 0) / 4),
        output_tokens: 0,
        latency_ms: Date.now() - started,
        success: true,
      })
      return { model: b.model, dims, vectors }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[rag/embed] ${b.model} via ${auth.provider} failed:`, msg.slice(0, 300))
      void trackAiUsage({
        user_id: opts.userId, feature: opts.feature ?? 'rag_embed', provider: auth.provider, model: b.model,
        latency_ms: Date.now() - started, success: false, error: msg.slice(0, 200),
      })
    }
  }
  return null
}
