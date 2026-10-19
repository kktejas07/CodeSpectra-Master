import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import {
  maskSecret,
  isMaskedSecret,
  readServerSecrets,
  writeServerSecrets,
  type ServerSecretsRecord,
} from '@/lib/server-secrets-cache'
import { SECRET_FIELDS, PLAIN_FIELDS, HIRING_FIELDS } from '@/lib/server-secrets-fields'

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
  // Hiring integrations: whether the env fallback is set (booleans only), and which
  // key encrypts tenant meeting credentials (env only — never stored in the DB).
  for (const k of HIRING_FIELDS) {
    masked[`env_${k}`] = Boolean((process.env[k.toUpperCase()] || '').trim())
  }
  const atsKey = (process.env.ATS_ENCRYPTION_KEY || '').trim()
  masked.ats_encryption_key_from_env = atsKey.length >= 32
  masked.ats_encryption_key_too_short = atsKey.length > 0 && atsKey.length < 32
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

  if (patch.livekit_url && !/^wss?:\/\/\S+$/i.test(patch.livekit_url.trim())) {
    return NextResponse.json({ error: 'LiveKit URL must start with wss:// (or ws:// for local testing)' }, { status: 400 })
  }
  if (patch.meta_whatsapp_call_mode && !['sip', 'graph'].includes(patch.meta_whatsapp_call_mode.trim())) {
    return NextResponse.json({ error: 'WhatsApp call mode must be sip or graph' }, { status: 400 })
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
      { error: 'Save failed. See server logs for details.' },
      { status: 500 },
    )
  }
}