import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { readServerSecrets } from '@/lib/server-secrets-cache'
import { auditAdmin } from '@/lib/admin-audit'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let paths: string[] = []
  try {
    const body = await req.json()
    paths = Array.isArray(body.paths) ? body.paths : (body.purge_all ? [] : ['/'])
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const secrets = await readServerSecrets()
  const zoneId = process.env.CLOUDFLARE_ZONE_ID?.trim() || (secrets.cloudflare_zone_id?.trim() || '')
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim() || (secrets.cloudflare_api_token?.trim() || '')

  if (!zoneId || !apiToken) {
    return NextResponse.json(
      { error: 'Cloudflare not configured. Add Zone ID and API Token in Settings → Integrations.' },
      { status: 503 },
    )
  }

  const body: Record<string, unknown> = paths.length > 0 ? { files: paths } : { purge_everything: true }

  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const json = await res.json()

    if (!res.ok || !json.success) {
      return NextResponse.json(
        { error: json.errors?.[0]?.message || `Cloudflare API error: ${res.status}` },
        { status: 502 },
      )
    }

    await auditAdmin(user, 'admin.cdn.purge', 'system', 'cdn', paths.length ? paths.slice(0, 20).join(', ') : 'all', 'warning')
    return NextResponse.json({
      success: true,
      paths: paths.length > 0 ? paths : ['/* (all)'],
    })
  } catch (e) {
    console.error('[CodeSpectra] admin/cdn/purge:', e)
    return NextResponse.json(
      { error: 'Network error reaching Cloudflare. Try again.' },
      { status: 502 },
    )
  }
}
