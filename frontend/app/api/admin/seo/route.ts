/**
 * Admin → Settings → SEO & AI search.
 *   GET  → settings + IndexNow state + resolved site URL
 *   PUT  → save settings (validated by mergeSeoSettings)
 * Superadmin only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { auditAdmin } from '@/lib/admin-audit'
import { getSeoSettings, invalidateSeoSettingsCache, saveSeoSettings } from '@/lib/seo/settings'
import { getIndexNowState } from '@/lib/seo/indexnow'
import { getSiteUrl, resolveSiteUrl } from '@/lib/seo/site'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  invalidateSeoSettingsCache()
  const settings = await getSeoSettings()
  return NextResponse.json({
    settings,
    site_url_resolved: resolveSiteUrl(settings.site_url),
    site_url_env: getSiteUrl(),
    indexnow: await getIndexNowState(),
  })
}

export async function PUT(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const input = (body && typeof body === 'object' && 'settings' in body ? (body as { settings: unknown }).settings : body) as Record<string, unknown>
  if (input && typeof input === 'object' && typeof input.indexnow_key === 'string' && input.indexnow_key && !/^[a-zA-Z0-9-]{8,128}$/.test(input.indexnow_key)) {
    return NextResponse.json({ error: 'IndexNow key must be 8–128 letters, digits or dashes.' }, { status: 400 })
  }
  try {
    const saved = await saveSeoSettings(input, gate.user.id)
    await auditAdmin(gate.user, 'admin.seo.settings.update', 'platform_settings', 'seo')
    return NextResponse.json({ settings: saved, site_url_resolved: resolveSiteUrl(saved.site_url) })
  } catch (e) {
    console.error('[admin/seo] save failed:', (e as Error)?.message)
    return NextResponse.json({ error: 'Failed to save SEO settings' }, { status: 500 })
  }
}
