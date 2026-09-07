import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import {
  maskSecret,
  isMaskedSecret,
  readServerSecrets,
  writeServerSecrets,
  type ServerSecretsRecord,
} from '@/lib/server-secrets-cache'

const SECRET_FIELDS: (keyof ServerSecretsRecord)[] = [
  'postal_api_key',
  'postal_webhook_secret',
  'razorpay_key_id',
  'razorpay_key_secret',
  'razorpay_webhook_secret',
  'github_app_token',
  'github_client_secret',
  'anthropic_api_key',
  'gemini_api_key',
  'openai_api_key',
  'groq_api_key',
  'opencode_api_key',
  'openrouter_api_key',
  'openwa_api_key',
  'nvidia_api_key',
  // ponytail: every provider the Settings → LLM UI offers MUST be here —
  // a missing entry means saves are silently dropped while the UI reports success.
  'deepseek_api_key',
  'cerebras_api_key',
  'mistral_api_key',
  'cohere_api_key',
  'fireworks_api_key',
  'xai_api_key',
  'replicate_api_key',
  'huggingface_api_key',
  'elevenlabs_api_key',
  'assemblyai_api_key',
  'deepgram_api_key',
  'pinecone_api_key',
  'qdrant_api_key',
  'tavily_api_key',
  'firecrawl_api_key',
  'serper_api_key',
  'jina_api_key',
  'exa_api_key',
  'langchain_api_key',
  'langfuse_api_key',
  'notion_api_key',
  'slack_api_key',
  'stability_api_key',
  'fal_api_key',
  'deepinfra_api_key',
  'novita_api_key',
  'ai21_api_key',
  'kimi_api_key',
  'lemonfox_api_key',
  'cloudflare_workers_api_key',
  'sambanova_api_key',
  'nscale_api_key',
  'chutes_api_key',
  'modelscope_api_key',
  'google_knowledge_graph_api_key',
  'browserbase_api_key',
  'brightdata_api_key',
  'scrapingbee_api_key',
  'cloudflare_api_token',
  'r2_secret_access_key',
  's3_secret_access_key',
  'phonepe_salt_key',
  'phonepe_webhook_secret',
  'stripe_secret_key',
  'stripe_webhook_secret',
  'upstash_redis_rest_token',
  'internal_backend_secret',
  'session_secret',
]

const PLAIN_FIELDS: (keyof ServerSecretsRecord)[] = [
  'postal_server',
  'postal_from_email',
  'trusted_origins_extra',
  'piston_url',
  'piston_run_timeout_ms',
  'piston_max_concurrent',
  'github_client_id',
  'stripe_price_pro_monthly',
  'stripe_price_pro_yearly',
  'stripe_price_enterprise_monthly',
  'stripe_price_enterprise_yearly',
  'cloudflare_zone_id',
  'r2_account_id',
  'r2_access_key_id',
  'r2_bucket',
  's3_provider',
  's3_endpoint',
  's3_region',
  's3_bucket',
  's3_access_key_id',
  'firebase_api_key',
  'firebase_auth_domain',
  'firebase_project_id',
  'firebase_storage_bucket',
  'firebase_messaging_sender_id',
  'firebase_app_id',
  'firebase_vapid_key',
  'phonepe_merchant_id',
  'phonepe_salt_index',
  'upstash_redis_rest_url',
  'openwa_base_url',
  'openwa_session_id',
  'openwa_default_country_code',
  'openwa_max_concurrency',
  'openwa_send_delay_ms',
]

const ALL_FIELDS: (keyof ServerSecretsRecord)[] = [...SECRET_FIELDS, ...PLAIN_FIELDS]

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const raw = await readServerSecrets()
  const masked: Record<string, string | number | null | boolean> = {}
  for (const k of SECRET_FIELDS) {
    const v = raw[k]
    const rawStr = typeof v === 'string' ? v.trim() : ''
    masked[`${k}_masked`] = maskSecret(rawStr || undefined)
    masked[`has_${k}`] = Boolean(rawStr)
    masked[`${k}_count`] = rawStr ? rawStr.split(',').map((s: string) => s.trim()).filter(Boolean).length : 0
  }
  for (const k of PLAIN_FIELDS) {
    masked[k] = String(raw[k] ?? '').trim() || null
  }
  return NextResponse.json({ secrets: masked })
}

export async function PATCH(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const patch: Partial<ServerSecretsRecord> = {}
  for (const k of ALL_FIELDS) {
    if (!(k in body)) continue
    const v = body[k]
    if (v === null) {
      patch[k] = undefined as never
    } else if (typeof v === 'string') {
      if (isMaskedSecret(v)) {
        // Don't skip cloudflare_api_token if it's masked — user didn't change it
        if (k === 'cloudflare_api_token') continue
        continue
      }
      patch[k] = v as never
    }
  }

  if (patch.razorpay_key_id && !/^rzp_(test|live)_[a-zA-Z0-9]+$/.test(patch.razorpay_key_id)) {
    return NextResponse.json(
      { error: 'razorpay_key_id must start with rzp_test_ or rzp_live_' },
      { status: 400 },
    )
  }

  try {
    const updated = await writeServerSecrets(patch)
    return NextResponse.json({
      ok: true,
      secrets: {
        cloudflare_zone_id: updated.cloudflare_zone_id || null,
        cloudflare_api_token_masked: maskSecret(updated.cloudflare_api_token),
        has_cloudflare_api_token: Boolean(updated.cloudflare_api_token?.trim()),
        r2_account_id: updated.r2_account_id || null,
        r2_access_key_id: updated.r2_access_key_id || null,
        r2_bucket: updated.r2_bucket || null,
        r2_secret_access_key_masked: maskSecret(updated.r2_secret_access_key),
        has_r2_secret_access_key: Boolean(updated.r2_secret_access_key?.trim()),
        s3_provider: updated.s3_provider || null,
        s3_endpoint: updated.s3_endpoint || null,
        s3_region: updated.s3_region || null,
        s3_bucket: updated.s3_bucket || null,
        s3_access_key_id: updated.s3_access_key_id || null,
        s3_secret_access_key_masked: maskSecret(updated.s3_secret_access_key),
        has_s3_secret_access_key: Boolean((updated.s3_secret_access_key || updated.r2_secret_access_key)?.trim()),
      },
    })
  } catch (e) {
    console.error('[server-secrets] PATCH error:', e)
    return NextResponse.json(
      { error: 'Save failed: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500 },
    )
  }
}