import { NextRequest, NextResponse } from 'next/server'
import { handleVendorEvent } from '@/lib/ats/bgv/service'
import { getBgvSettings, getVendorSecrets } from '@/lib/ats/bgv/settings'
import { idfyVendor } from '@/lib/ats/bgv/vendors/idfy'
import { resolveClientIp } from '@/lib/client-ip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST ?tenant=<id>&token=<shared token> — IDfy task callback. IDfy doesn't
 * sign callbacks, so the tenant's random token in the URL (timing-safe
 * compare) and, when turned on, IDfy's IP allow-list authenticate it. The
 * body is never trusted for results: it only names the task, and the result
 * is re-read over the authenticated IDfy API. Idempotent per task + status.
 * 4xx are not retried by IDfy, 5xx are.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const tenant = url.searchParams.get('tenant') || ''
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(tenant)) return NextResponse.json({ error: 'Unknown tenant' }, { status: 400 })
  const raw = await req.text()
  if (raw.length > 1_000_000) return NextResponse.json({ error: 'Too large' }, { status: 413 })
  const [settings, secrets] = await Promise.all([getBgvSettings(tenant), getVendorSecrets(tenant)])
  const ip = resolveClientIp(req.headers).replace(/^unknown$/, '')
  if (!idfyVendor.verifyWebhook!(raw, req.headers, secrets, { settings, url, ip })) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ev = idfyVendor.parseWebhook!(raw, settings)
  if (!ev) return NextResponse.json({ ok: true, ignored: true })
  try {
    const r = await handleVendorEvent(tenant, 'idfy', ev)
    return NextResponse.json({ ok: true, result: r })
  } catch (e) {
    console.error('[ats/bgv] idfy webhook failed:', e instanceof Error ? e.message : 'error')
    return NextResponse.json({ error: 'Temporary failure' }, { status: 500 })
  }
}
