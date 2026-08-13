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
  'nvidia_api_key',
  'openrouter_api_key',
  'cloudflare_api_token',
  'phonepe_salt_key',
  'phonepe_webhook_secret',
  'stripe_secret_key',
  'stripe_webhook_secret',
  'upstash_redis_rest_token',
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
]

const ALL_FIELDS: (keyof ServerSecretsRecord)[] = [...SECRET_FIELDS, ...PLAIN_FIELDS]

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const raw = await readServerSecrets()
  const masked: Record<string, string | null | boolean> = {}
  for (const k of SECRET_FIELDS) {
    const v = raw[k]
    masked[`${k}_masked`] = maskSecret(typeof v === 'string' ? v : undefined)
    masked[`has_${k}`] = Boolean(String(v ?? '').trim())
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
      if (isMaskedSecret(v)) continue
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