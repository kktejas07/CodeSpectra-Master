import { NextRequest, NextResponse } from 'next/server'
import { handleVendorEvent } from '@/lib/ats/bgv/service'
import { getVendorSecrets } from '@/lib/ats/bgv/settings'
import { checkrVendor } from '@/lib/ats/bgv/vendors/checkr'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST ?tenant=<id> — Checkr webhook. The X-Checkr-Signature HMAC (tenant's API
 * key or webhook secret) is checked on the raw body before anything else is
 * parsed. Idempotent per event id. Always 200 for authentic events we don't
 * track, so Checkr stops retrying.
 */
export async function POST(req: NextRequest) {
  const tenant = new URL(req.url).searchParams.get('tenant') || ''
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(tenant)) return NextResponse.json({ error: 'Unknown tenant' }, { status: 400 })
  const raw = await req.text()
  if (raw.length > 1_000_000) return NextResponse.json({ error: 'Too large' }, { status: 413 })
  const secrets = await getVendorSecrets(tenant)
  if (!checkrVendor.verifyWebhook!(raw, req.headers, secrets)) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  const ev = checkrVendor.parseWebhook!(raw)
  if (!ev) return NextResponse.json({ ok: true, ignored: true })
  try {
    const r = await handleVendorEvent(tenant, 'checkr', ev)
    return NextResponse.json({ ok: true, result: r })
  } catch (e) {
    console.error('[ats/bgv] checkr webhook failed:', e)
    return NextResponse.json({ error: 'Temporary failure' }, { status: 500 })
  }
}
