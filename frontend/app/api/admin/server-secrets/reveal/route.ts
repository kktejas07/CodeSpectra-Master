import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { readServerSecrets, type ServerSecretsRecord } from '@/lib/server-secrets-cache'

// Keep this list in sync with SECRET_FIELDS in app/api/admin/server-secrets/route.ts —
// every key that can be saved must be revealable. (Drift here silently breaks the
// "reveal saved secret" button with a 400 "Invalid key".)
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
  // ponytail: keep in sync with SECRET_FIELDS in route.ts (see note there).
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

export async function GET(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key') as keyof ServerSecretsRecord | null
  if (!key) {
    return NextResponse.json({ error: 'Missing key param' }, { status: 400 })
  }
  if (!SECRET_FIELDS.includes(key)) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
  }
  const raw = await readServerSecrets()
  return NextResponse.json({ value: raw[key] ?? null })
}