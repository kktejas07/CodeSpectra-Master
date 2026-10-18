/**
 * Provider selection for the admin agent: the platform LLM settings first
 * (lib/ai/get-user-model resolveModel), then PROVIDER_FALLBACK_CHAIN entries
 * that have a key. Any failure before the first streamed chunk (rate limit,
 * dead key, 5xx, a model that rejects tools) moves to the next target; once
 * text or a tool call has been emitted the step belongs to that provider, so
 * tool-call ids and semantics stay consistent. Server only.
 */
import { createOpenAIProvider } from './openai'
import { createAnthropicProvider } from './anthropic'
import { createGeminiProvider } from './gemini'
import { isRateLimitError } from '@/lib/ai/provider-fallback'
import { ProviderHttpError, type AdapterKind, type ChatChunk, type ChatProvider, type ChatRequest, type FetchLike, type ProviderTarget } from './types'

export * from './types'

export function adapterKindFor(provider: string): AdapterKind {
  if (provider === 'anthropic') return 'anthropic'
  if (provider === 'gemini') return 'gemini'
  return 'openai'
}

export function createProvider(target: ProviderTarget, fetchImpl?: FetchLike): ChatProvider {
  switch (target.kind) {
    case 'anthropic': return createAnthropicProvider(target, fetchImpl)
    case 'gemini': return createGeminiProvider(target, fetchImpl)
    default: return createOpenAIProvider(target, fetchImpl)
  }
}

const DEFAULT_ENDPOINTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  opencode: 'https://opencode.ai/zen/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
}

/** At most this many provider/model pairs are tried per model call (bounds latency). */
export const MAX_PROVIDER_ATTEMPTS = 4

/** Resolve the ordered provider targets for this user (server only). */
export async function resolveProviderTargets(userId: string): Promise<ProviderTarget[]> {
  const [{ resolveModel }, { getApiKey }, { PROVIDER_FALLBACK_CHAIN }, { LLM_PROVIDERS }] = await Promise.all([
    import('@/lib/ai/get-user-model'),
    import('@/lib/ai/get-api-key'),
    import('@/lib/ai/provider-fallback'),
    import('@/lib/llm-config'),
  ])
  const endpointFor = (provider: string, explicit?: string) =>
    (explicit && /^https?:\/\//.test(explicit) ? explicit : '') ||
    LLM_PROVIDERS.find((p) => p.id === provider)?.endpoint ||
    DEFAULT_ENDPOINTS[provider] ||
    ''

  const targets: ProviderTarget[] = []
  const seen = new Set<string>()
  const add = (provider: string, model: string, endpoint: string, apiKey: string) => {
    const id = `${provider}/${model}`
    if (!provider || !model || !apiKey || !endpoint || seen.has(id)) return
    seen.add(id)
    targets.push({ kind: adapterKindFor(provider), provider, model, endpoint, apiKey })
  }

  // getRoundRobinKey falls back to the platform's single legacy api_key for
  // ANY provider without its own keys; never send that key to another vendor.
  let platformKey = ''
  let platformProvider = ''
  try {
    const pref = await resolveModel(userId, 'chat_model')
    platformKey = pref.apiKeyOverride || ''
    platformProvider = pref.providerOverride
    if (pref.providerOverride && pref.modelOverride) {
      let endpoint = endpointFor(pref.providerOverride, pref.endpointOverride)
      if (pref.providerOverride === 'custom' && !endpoint) {
        const { readServerSecrets } = await import('@/lib/server-secrets-cache')
        const s = (await readServerSecrets()) as Record<string, unknown>
        endpoint = String(s.custom_endpoint || process.env.CUSTOM_ENDPOINT || '').trim().replace(/\/+$/, '')
      }
      const key = pref.apiKeyOverride || (await getApiKey(pref.providerOverride as never))?.key || ''
      add(pref.providerOverride, pref.modelOverride, endpoint, key)
    }
  } catch (e) {
    console.error('[agent] resolveModel failed, using the fallback chain:', e)
  }

  for (const entry of PROVIDER_FALLBACK_CHAIN) {
    if (targets.length >= MAX_PROVIDER_ATTEMPTS) break
    if (seen.has(`${entry.provider}/${entry.model}`)) continue
    // openrouter/auto may route to a model without tool support — skip it here.
    if (entry.model === 'openrouter/auto') continue
    const key = (await getApiKey(entry.provider as never))?.key
    if (!key || (platformKey && key === platformKey && entry.provider !== platformProvider)) continue
    add(entry.provider, entry.model, endpointFor(entry.provider, entry.endpoint), key)
  }
  return targets
}

export class AllProvidersFailedError extends Error {
  constructor(public readonly attempts: string[], last: string) {
    super(attempts.length ? `The AI model is unavailable right now (${last})` : 'No AI model is configured. Ask a platform admin to set one in Settings → AI.')
    this.name = 'AllProvidersFailedError'
  }
}

export interface FallbackDeps {
  createProvider?: (t: ProviderTarget) => ChatProvider
  /** Called when a key hit a rate limit (mark it so round-robin skips it). */
  onRateLimited?: (t: ProviderTarget, retryAfterMs: number) => void | Promise<void>
  classify?: (status: number, body: string) => { rateLimited: boolean; retryAfterMs: number }
}

/** Same rate-limit rules as lib/ai/provider-fallback (plus Anthropic 529 / Gemini RESOURCE_EXHAUSTED). */
function defaultClassify(status: number, body: string) {
  const r = isRateLimitError(body, status)
  const rateLimited = r.isRateLimit || status === 529 || /resource.?exhausted/i.test(body)
  return { rateLimited, retryAfterMs: (r.retryAfterSec ?? 60) * 1000 }
}

function isAbort(e: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  return e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError') && !(e instanceof ProviderHttpError)
}

/** Stream one model call, falling back to the next target on failure before any output. */
export async function* chatWithFallback(targets: ProviderTarget[], req: ChatRequest, deps: FallbackDeps = {}): AsyncGenerator<ChatChunk> {
  const make = deps.createProvider ?? ((t: ProviderTarget) => createProvider(t))
  const classify = deps.classify ?? defaultClassify
  const attempts: string[] = []
  let last = ''
  for (const t of targets.slice(0, MAX_PROVIDER_ATTEMPTS)) {
    attempts.push(`${t.provider}/${t.model}`)
    let emitted = false
    try {
      for await (const chunk of make(t).chat(req)) {
        if (!emitted) {
          emitted = true
          yield { type: 'meta', provider: t.provider, model: t.model }
        }
        yield chunk
      }
      return
    } catch (e) {
      if (isAbort(e, req.signal)) throw e
      if (emitted) throw e
      last = e instanceof Error ? e.message.slice(0, 200) : String(e)
      if (e instanceof ProviderHttpError) {
        const c = classify(e.status, e.body)
        if (c.rateLimited && deps.onRateLimited) {
          try { await deps.onRateLimited(t, c.retryAfterMs) } catch { /* best effort */ }
        }
      }
      console.warn(`[agent] provider ${t.provider}/${t.model} failed, trying next: ${last}`)
    }
  }
  throw new AllProvidersFailedError(attempts, last)
}

/** A ChatProvider that walks the resolved targets with fallback (what the loop uses). */
export function fallbackProvider(targets: ProviderTarget[], deps: FallbackDeps = {}): ChatProvider {
  return {
    provider: targets[0]?.provider ?? 'none',
    model: targets[0]?.model ?? 'none',
    chat: (req) => chatWithFallback(targets, req, deps),
  }
}

/** Server wiring: mark rate-limited keys via lib/ai/get-round-robin-key. */
export async function markTargetRateLimited(t: ProviderTarget, retryAfterMs: number): Promise<void> {
  const { markKeyRateLimited } = await import('@/lib/ai/get-round-robin-key')
  await markKeyRateLimited(t.provider as never, t.apiKey, Math.min(Math.max(retryAfterMs, 10_000), 10 * 60_000))
}
