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
  'cloudflare_api_token',
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