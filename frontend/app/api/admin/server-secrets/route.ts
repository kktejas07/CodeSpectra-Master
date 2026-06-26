import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import {
  maskSecret,
  readServerSecrets,
  writeServerSecrets,
  type ServerSecretsRecord,
} from '@/lib/server-secrets-cache'

const SECRET_FIELDS: (keyof ServerSecretsRecord)[] = [
  'resend_api_key',
  'sendgrid_api_key',
  'razorpay_key_id',
  'razorpay_key_secret',
  'razorpay_webhook_secret',
  // legacy
  'stripe_secret_key',
  'stripe_webhook_secret',
]

const PLAIN_FIELDS: (keyof ServerSecretsRecord)[] = [
  'resend_from_email',
  'sendgrid_from_email',
  'stripe_price_pro_monthly',
  'stripe_price_pro_yearly',
  'stripe_price_enterprise_monthly',
  'stripe_price_enterprise_yearly',
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
      patch[k] = v as never
    }
  }

  // Basic Razorpay key sanity-check
  if (patch.razorpay_key_id && !/^rzp_(test|live)_[a-zA-Z0-9]+$/.test(patch.razorpay_key_id)) {
    return NextResponse.json(
      { error: 'razorpay_key_id must start with rzp_test_ or rzp_live_' },
      { status: 400 },
    )
  }

  await writeServerSecrets(patch)
  return NextResponse.json({ ok: true })
}
