import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/admin-service-client'
import {
  invalidateServerSecretsCache,
  maskSecret,
  SERVER_SECRETS_PLATFORM_KEY,
  type ServerSecretsRecord,
} from '@/lib/server-secrets-cache'

const SECRET_FIELDS: (keyof ServerSecretsRecord)[] = [
  'resend_api_key',
  'sendgrid_api_key',
  'stripe_secret_key',
  'stripe_webhook_secret',
]

const ALL_FIELDS: (keyof ServerSecretsRecord)[] = [
  ...SECRET_FIELDS,
  'resend_from_email',
  'sendgrid_from_email',
  'stripe_price_pro_monthly',
  'stripe_price_pro_yearly',
  'stripe_price_enterprise_monthly',
  'stripe_price_enterprise_yearly',
]

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const supabase = getServiceSupabase()
  if (!supabase) {
    return NextResponse.json(
      { error: 'Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY' },
      { status: 503 }
    )
  }

  const { data, error } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', SERVER_SECRETS_PLATFORM_KEY)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const raw = (data?.value as ServerSecretsRecord) || {}
  const masked: Record<string, string | null | boolean> = {}

  for (const k of SECRET_FIELDS) {
    const v = raw[k]
    masked[`${k}_masked`] = maskSecret(typeof v === 'string' ? v : undefined)
    masked[`has_${k}`] = Boolean(String(v ?? '').trim())
  }

  for (const k of ['resend_from_email', 'sendgrid_from_email'] as const) {
    masked[k] = String(raw[k] ?? '').trim() || null
  }

  for (const k of [
    'stripe_price_pro_monthly',
    'stripe_price_pro_yearly',
    'stripe_price_enterprise_monthly',
    'stripe_price_enterprise_yearly',
  ] as const) {
    masked[k] = String(raw[k] ?? '').trim() || null
  }

  return NextResponse.json({ secrets: masked })
}

export async function PATCH(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const supabase = getServiceSupabase()
  if (!supabase) {
    return NextResponse.json(
      { error: 'Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY' },
      { status: 503 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { data: existing, error: readErr } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', SERVER_SECRETS_PLATFORM_KEY)
    .maybeSingle()

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 })
  }

  const prev: ServerSecretsRecord = { ...((existing?.value as ServerSecretsRecord) || {}) }
  const next: ServerSecretsRecord = { ...prev }

  const stripePriceKeys = [
    'stripe_price_pro_monthly',
    'stripe_price_pro_yearly',
    'stripe_price_enterprise_monthly',
    'stripe_price_enterprise_yearly',
  ] as const

  for (const k of ALL_FIELDS) {
    if (!(k in body)) continue
    const v = body[k]
    if (v === null || v === '') {
      delete next[k]
      continue
    }
    if (typeof v === 'string') {
      const t = v.trim()
      if (!t) delete next[k]
      else {
        if (stripePriceKeys.includes(k as (typeof stripePriceKeys)[number]) && !/^price_[a-zA-Z0-9]+$/.test(t)) {
          return NextResponse.json(
            { error: `Invalid Stripe price ID for ${k}: must match price_… (from Stripe Dashboard).` },
            { status: 400 }
          )
        }
        next[k] = t
      }
    }
  }

  const { error: writeErr } = await supabase.from('platform_settings').upsert(
    {
      key: SERVER_SECRETS_PLATFORM_KEY,
      value: next as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  )

  if (writeErr) {
    return NextResponse.json({ error: writeErr.message }, { status: 500 })
  }

  invalidateServerSecretsCache()
  return NextResponse.json({ ok: true })
}
