/**
 * POST /api/admin/seo/indexnow  { action: 'generate' | 'submit', urls?: string[] }
 *   generate → returns a fresh random key (not saved until the admin saves settings)
 *   submit   → submits the given URLs, or everything changed in the last 7 days
 * Superadmin only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { auditAdmin } from '@/lib/admin-audit'
import { changedPublicUrls, generateIndexNowKey, submitIndexNow } from '@/lib/seo/indexnow'
import { getSiteOrigin } from '@/lib/seo/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const body = (await req.json().catch(() => ({}))) as { action?: string; urls?: unknown }
  if (body.action === 'generate') return NextResponse.json({ key: generateIndexNowKey() })
  if (body.action !== 'submit') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  const site = await getSiteOrigin()
  const urls = Array.isArray(body.urls) && body.urls.length
    ? body.urls.filter((u): u is string => typeof u === 'string').slice(0, 1000)
    : await changedPublicUrls(site, new Date(Date.now() - 7 * 86_400_000).toISOString())
  const r = await submitIndexNow(urls)
  if (r.reason === 'disabled') return NextResponse.json({ error: 'Turn IndexNow on and save a key first.' }, { status: 409 })
  await auditAdmin(gate.user, 'admin.seo.indexnow.submit', 'seo', 'indexnow', `${r.submitted} url(s), status ${r.status ?? 'n/a'}`)
  return NextResponse.json(r, { status: r.ok ? 200 : 502 })
}
