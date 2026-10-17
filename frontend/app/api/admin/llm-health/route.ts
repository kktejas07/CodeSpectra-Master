/**
 * GET/POST /api/admin/llm-health — live LLM provider health board.
 *
 * POST probes every fallback-chain provider with a 1-token completion
 * through the REAL production path (backend /internal/ai/complete with
 * provider_override + the stored key), then caches the result in
 * platform_settings { key: 'llm_health' }. GET returns the cached doc so
 * the Settings tab and Course Generator strip render instantly.
 *
 * What we report honestly: per-provider status (ok / rate_limited /
 * bad_key / dead_model / no_key / error), latency, key count, last error,
 * and 7-day observed usage. Quota ceilings are only shown where a vendor
 * API genuinely exposes them (OpenRouter /auth/key) — everything else is
 * observed traffic, never fabricated.
 */
import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { readServerSecrets, isMaskedSecret } from '@/lib/server-secrets-cache'
import {
  buildProbeHeaders,
  chainProbeTargets,
  classifyProbeError,
  type HealthDoc,
  type ProbeResult,
} from '@/lib/ai/provider-health'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEALTH_KEY = 'llm_health'
const PROBE_TIMEOUT_MS = 20_000
const PROBE_CONCURRENCY = 3

function backendBase(): string {
  // ponytail: same resolution as provider-fallback.ts — in prod the backend
  // is a sibling Swarm service, NOT localhost.
  const PROD_BACKEND = 'http://codespectra-backend-cd7lq6:8000'
  return (
    process.env.INTERNAL_BACKEND_URL ||
    (process.env.COURSE_WORKER === '1' || process.env.NODE_ENV === 'production'
      ? PROD_BACKEND
      : 'http://localhost:8001')
  )
}

async function internalSecret(): Promise<string> {
  let secret = process.env.INTERNAL_BACKEND_SECRET?.trim() || ''
  if (!secret) {
    try {
      const secrets = (await readServerSecrets()) as Record<string, unknown>
      const stored =
        typeof secrets.internal_backend_secret === 'string'
          ? secrets.internal_backend_secret.trim()
          : ''
      if (stored && !isMaskedSecret(stored)) secret = stored
    } catch {}
  }
  return secret
}

function countKeys(raw: unknown): number {
  if (typeof raw !== 'string' || !raw.trim() || isMaskedSecret(raw)) return 0
  return raw
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k && !isMaskedSecret(k)).length
}

async function probeOne(
  target: { provider: string; model: string; endpoint?: string; secretKey: string; free: boolean },
  apiKey: string,
  backend: string,
  secret: string,
): Promise<{ ok: boolean; error: string; status?: number; latencyMs: number }> {
  const start = Date.now()
  try {
    const res = await fetch(`${backend}/internal/ai/complete`, {
      method: 'POST',
      headers: buildProbeHeaders(apiKey, secret),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      body: JSON.stringify({
        session_id: 'llm-health-probe',
        // ponytail: 1-token reply — proves key AND model are live for ~tens
        // of tokens, not a full generation.
        system_message: 'Reply with exactly: ok',
        user_message: 'ping',
        model_role: 'fast',
        response_format: 'text',
        provider_override: target.provider,
        model_override: target.model,
        endpoint_override: target.endpoint || '',
        api_key_override: apiKey,
      }),
    })
    const latencyMs = Date.now() - start
    if (res.ok) return { ok: true, error: '', latencyMs }
    const text = await res.text().catch(() => '')
    return { ok: false, error: text.slice(0, 200) || `HTTP ${res.status}`, status: res.status, latencyMs }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[CodeSpectra] admin/llm-health probe:', e)
    return {
      ok: false,
      error: /timeout/i.test(msg) ? 'Probe timed out after 20s (provider slow or unreachable)' : 'Probe failed. See server logs for details.',
      latencyMs: Date.now() - start,
    }
  }
}

/** Genuine quota numbers — only OpenRouter exposes a key-usage endpoint. */
async function openRouterQuota(apiKey: string): Promise<ProbeResult['quota']> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const json = await res.json().catch(() => ({}))
    const d = json?.data || {}
    return {
      limit: typeof d.limit === 'number' ? d.limit : null,
      usage: typeof d.usage === 'number' ? d.usage : null,
    }
  } catch {
    return null
  }
}

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const db = await getMongoDb()
  const doc = await db.collection('platform_settings').findOne({ key: HEALTH_KEY })
  const value = (doc?.value || {}) as Partial<HealthDoc>
  return NextResponse.json({ checkedAt: value.checkedAt ?? null, results: value.results ?? [] } satisfies HealthDoc)
}

export async function POST() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const targets = chainProbeTargets()
  const secrets = (await readServerSecrets()) as Record<string, unknown>
  // Custom gateway joins the probe when its endpoint is configured (same
  // rule as the fallback chain: endpoint + key required, never probe blind).
  const customEndpoint = String(secrets.custom_endpoint || '').trim().replace(/\/+$/, '')
  if (customEndpoint && /^https?:\/\//.test(customEndpoint)) {
    targets.push({
      provider: 'custom',
      model: String(secrets.custom_model || '').trim() || 'custom',
      endpoint: customEndpoint,
      secretKey: 'custom_api_key',
      free: false,
    })
  }
  const { getApiKey } = await import('@/lib/ai/get-api-key')
  const backend = backendBase()
  const secret = await internalSecret()

  const db = await getMongoDb()
  const llmDoc = await db.collection('platform_settings').findOne({ key: 'llm' })
  const now = Date.now()

  const results: ProbeResult[] = new Array(targets.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(PROBE_CONCURRENCY, targets.length) }, async () => {
    while (cursor < targets.length) {
      const i = cursor++
      const t = targets[i]
      const keys = countKeys(secrets[t.secretKey])
      const keyResult = await getApiKey(t.provider as never).catch(() => null)
      const apiKey = (keyResult as { key?: string } | null)?.key || ''
      if (!apiKey) {
        results[i] = { ...t, status: 'no_key', latencyMs: null, keys, error: 'No key configured' }
        continue
      }
      const probe = await probeOne(t, apiKey, backend, secret)
      const rateLimitedUntil =
        (llmDoc?.value as { keys?: Record<string, { rate_limited_until?: number }[]> } | null)?.keys?.[
          t.provider
        ]?.some((k) => (k.rate_limited_until || 0) > now) ?? false
          ? (llmDoc?.value as { keys?: Record<string, { rate_limited_until?: number }[]> }).keys![t.provider].reduce(
              (m, k) => Math.max(m, k.rate_limited_until || 0),
              0,
            )
          : null
      results[i] = {
        ...t,
        status: probe.ok ? 'ok' : classifyProbeError(probe.error, probe.status),
        latencyMs: probe.latencyMs,
        keys,
        error: probe.ok ? undefined : probe.error,
        quota: probe.ok && t.provider === 'openrouter' ? await openRouterQuota(apiKey) : null,
        rateLimitedUntil,
      }
    }
  })
  await Promise.all(workers)

  const doc: HealthDoc = { checkedAt: new Date().toISOString(), results }
  await db.collection('platform_settings').updateOne(
    { key: HEALTH_KEY },
    { $set: { key: HEALTH_KEY, value: doc, updated_at: new Date().toISOString() } },
    { upsert: true },
  )
  return NextResponse.json(doc)
}
