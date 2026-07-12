import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { maskSecret, isMaskedSecret } from '@/lib/server-secrets-cache'
import { LLM_CONFIG_DEFAULTS, LLM_PROVIDERS, type LLMConfig, type LLMProviderId } from '@/lib/llm-config'

const PLATFORM_KEY = 'llm'

function maskConfig(cfg: LLMConfig): LLMConfig {
  return { ...cfg, api_key: maskSecret(cfg.api_key) || '' }
}

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const db = await getMongoDb()
  const doc = await db.collection('platform_settings').findOne({ key: PLATFORM_KEY })
  const config = (doc?.value as LLMConfig) || LLM_CONFIG_DEFAULTS
  if (config.provider === 'opencode' && (!config.endpoint || config.endpoint.includes('openrouter.ai') || config.endpoint.includes('opencode.june07.com'))) {
    config.endpoint = 'https://opencode.ai/zen/v1'
  } else if (config.provider === 'openrouter' && (!config.endpoint || config.endpoint.includes('opencode.june07.com'))) {
    config.endpoint = 'https://openrouter.ai/api/v1'
  }
  return NextResponse.json({ config: maskConfig(config) })
}

export async function PATCH(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let body: Partial<LLMConfig>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const db = await getMongoDb()
  const existing = await db.collection('platform_settings').findOne({ key: PLATFORM_KEY })
  const prev = (existing?.value as LLMConfig) || LLM_CONFIG_DEFAULTS

  const nextProvider = (body.provider && LLM_PROVIDERS.some(p => p.id === body.provider) ? body.provider : prev.provider) as LLMProviderId
  let rawEndpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : prev.endpoint
  if (nextProvider === 'opencode' && (!rawEndpoint || rawEndpoint.includes('openrouter.ai') || rawEndpoint.includes('opencode.june07.com'))) {
    rawEndpoint = 'https://opencode.ai/zen/v1'
  } else if (nextProvider === 'openrouter' && (!rawEndpoint || rawEndpoint.includes('opencode.june07.com'))) {
    rawEndpoint = 'https://openrouter.ai/api/v1'
  }

  const next: LLMConfig = {
    provider: (body.provider && LLM_PROVIDERS.some(p => p.id === body.provider) ? body.provider : prev.provider) as LLMProviderId,
    model: typeof body.model === 'string' && body.model.trim() ? body.model.trim() : prev.model,
    endpoint: rawEndpoint,
    api_key: typeof body.api_key === 'string' && !isMaskedSecret(body.api_key) ? body.api_key.trim() : (isMaskedSecret(prev.api_key) ? '' : prev.api_key),
  }

  await db.collection('platform_settings').updateOne(
    { key: PLATFORM_KEY },
    { $set: { value: (next as any) as Record<string, unknown>, updated_at: new Date().toISOString() } },
    { upsert: true },
  )

  return NextResponse.json({ ok: true })
}
