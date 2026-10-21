import { NextRequest, NextResponse } from 'next/server'
import { handleVendorEvent } from '@/lib/ats/bgv/service'
import { getBgvSettings, getVendorSecrets } from '@/lib/ats/bgv/settings'
import { authBridgeVendor } from '@/lib/ats/bgv/vendors/authbridge'
import { resolveClientIp } from '@/lib/client-ip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST ?tenant=<id> — AuthBridge callback. The HMAC of the raw body (header,
 * algorithm and encoding from the tenant's AuthBridge settings, key = the
 * webhook secret) is checked before anything is parsed. Idempotent per event
 * id (configured field, else a hash of the body). With a status path set,
 * the result is re-read over the API rather than taken from the body.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const tenant = url.searchParams.get('tenant') || ''
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(tenant)) return NextResponse.json({ error: 'Unknown tenant' }, { status: 400 })
  const raw = await req.text()
  if (raw.length > 1_000_000) return NextResponse.json({ error: 'Too large' }, { status: 413 })
  const [settings, secrets] = await Promise.all([getBgvSettings(tenant), getVendorSecrets(tenant)])
  if (!settings.authbridge?.enabled) return NextResponse.json({ error: 'Not configured' }, { status: 404 })
  const ip = resolveClientIp(req.headers).replace(/^unknown$/, '')
  if (!authBridgeVendor.verifyWebhook!(raw, req.headers, secrets, { settings, url, ip })) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  const ev = authBridgeVendor.parseWebhook!(raw, settings)
  if (!ev) return NextResponse.json({ ok: true, ignored: true })
  try {
    const r = await handleVendorEvent(tenant, 'authbridge', ev)
    return NextResponse.json({ ok: true, result: r })
  } catch (e) {
    console.error('[ats/bgv] authbridge webhook failed:', e instanceof Error ? e.message : 'error')
    return NextResponse.json({ error: 'Temporary failure' }, { status: 500 })
  }
}
