/**
 * Shared provider-health helpers (client-safe: no server imports).
 *
 * The Health tab and the Course Generator strip both render probe results
 * produced by POST /api/admin/llm-health. That route sends a 1-token
 * completion per chain provider through the REAL production path
 * (Next → backend /internal/ai/complete → provider), so a green row means
 * generation will actually work — unlike the old /models auth check, which
 * passed while every chain model 404'd (2026-09-21 outage).
 */
// ponytail: SERVER/TEST-ONLY import — provider-fallback.ts pulls in mongodb
// and server-secrets-cache, so never import chainProbeTargets() from a
// client component (the Health tab renders server-produced results instead).
import { PROVIDER_FALLBACK_CHAIN } from '@/lib/ai/provider-fallback'

export type ProbeStatus =
  | 'ok'
  | 'rate_limited'
  | 'bad_key'
  | 'dead_model'
  | 'no_key'
  | 'error'

export interface ProbeTarget {
  provider: string
  model: string
  endpoint?: string
  secretKey: string
  free: boolean
}

export interface ProbeResult extends ProbeTarget {
  status: ProbeStatus
  latencyMs: number | null
  keys: number
  error?: string
  /** Genuine quota numbers — only OpenRouter exposes these; otherwise null. */
  quota?: { limit: number | null; usage: number | null } | null
  rateLimitedUntil?: number | null
}

export interface HealthDoc {
  checkedAt: string | null
  results: ProbeResult[]
}

/**
 * Headers for a probe POST to backend /internal/ai/complete.
 * ponytail: the backend container holds NO LLM keys (they live in Mongo,
 * read by the Next layer), and CompleteReq has no api_key_override field —
 * so the ONLY way the key reaches build_chat/resolve_key is these headers.
 * Probing without them 500s every provider with "API Key not configured"
 * even when all keys are fresh (0/10 red, 2026-09-22). Mirrors makeRequest()
 * in provider-fallback.ts, which is why the course path worked while the
 * probe never did.
 */
export function buildProbeHeaders(apiKey: string, internalSecret: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(internalSecret ? { 'x-internal-secret': internalSecret } : {}),
    'x-api-key': apiKey,
    'x-openai-api-key': apiKey,
    'x-gemini-api-key': apiKey,
    'x-anthropic-api-key': apiKey,
  }
}

/** First chain entry per provider, in fallback order — one probe each. */
export function chainProbeTargets(): ProbeTarget[] {
  const seen = new Set<string>()
  const out: ProbeTarget[] = []
  for (const e of PROVIDER_FALLBACK_CHAIN) {
    if (seen.has(e.provider)) continue
    seen.add(e.provider)
    out.push({
      provider: e.provider,
      model: e.model,
      endpoint: e.endpoint,
      secretKey: e.secretKey,
      free: e.free,
    })
  }
  return out
}

/**
 * Classify a failed probe into an actionable bucket.
 * Order matters: 429/credits checks first (a 429 body can also mention
 * "invalid" in passing), then auth, then dead-model 404s.
 */export function classifyProbeError(text: string, status?: number): ProbeStatus {
  const t = text || ''
  if (
    status === 429 ||
    /rate.?limit|quota.?exceeded|insufficient.?credits|too.?many.?requests|requests.*per.*(minute|day)|exceeded.*quota|try again in \d+s/i.test(t)
  ) {
    return 'rate_limited'
  }
  if (
    status === 401 ||
    status === 403 ||
    /invalid.*api.*key|incorrect api key|authentication.*fail|unauthorized|invalid.*key|key.*not.*found|disabled.*account|suspended/i.test(t)
  ) {
    return 'bad_key'
  }
  if (
    status === 404 ||
    /model.*not.*found|no.*provider.*run.*this model|model is unavailable|does not exist.*model|unsupported model/i.test(t)
  ) {
    return 'dead_model'
  }
  return 'error'
}
