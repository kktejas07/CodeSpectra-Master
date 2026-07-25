import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { readServerSecrets } from '@/lib/server-secrets-cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function cfFetch(token: string, path: string) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Cloudflare API ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function GET() {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const secrets = await readServerSecrets()
  const zoneId = process.env.CLOUDFLARE_ZONE_ID?.trim() || (secrets.cloudflare_zone_id?.trim() || '')
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim() || (secrets.cloudflare_api_token?.trim() || '')
  if (!zoneId || !apiToken) {
    return NextResponse.json({ configured: false, error: 'Cloudflare not configured' })
  }

  try {
    const since = Math.floor(Date.now() / 1000) - 30 * 86400
    const until = Math.floor(Date.now() / 1000)

    const [dashResult, zoneResult] = await Promise.all([
      cfFetch(apiToken, `/zones/${zoneId}/analytics/dashboard?since=${since}&until=${until}`),
      cfFetch(apiToken, `/zones/${zoneId}`),
    ])

    if (!dashResult.success) {
      const code = dashResult.errors?.[0]?.code
      const msg = dashResult.errors?.[0]?.message || ''
      if (code === 10000 || code === 10001 || msg.toLowerCase().includes('authentication') || msg.toLowerCase().includes('forbidden')) {
        return NextResponse.json({ configured: false, error: 'Invalid or expired Cloudflare API token' })
      }
      throw new Error(msg || `Cloudflare error code ${code}`)
    }

    const zoneName = (zoneResult.result as any)?.name || ''

    const d = (dashResult.result as any) || {}
    const requests = d.requests || {}
    const bandwidth = d.bandwidth || {}

    const totalRequests = requests.requests_total || requests.total || 0
    const totalCached = requests.cached || 0
    const totalBytes = bandwidth.pure_total || bandwidth.total || 0
    const totalUniques = requests.uniques || 0

    return NextResponse.json({
      configured: true,
      zone: zoneName,
      traffic: {
        requests: totalRequests,
        cached: totalCached,
        bytes: totalBytes,
        uniques: totalUniques,
        cacheRatio: totalRequests > 0 ? Math.round((totalCached / totalRequests) * 100) : 0,
      },
      topCountries: [],
    })
  } catch (e) {
    const msg = (e as Error).message
    if (msg.includes('Authentication error') || msg.includes('Invalid token') || msg.includes('10000')) {
      return NextResponse.json({ configured: false, error: 'Invalid or expired Cloudflare API token' })
    }
    return NextResponse.json({ configured: false, error: msg }, { status: 502 })
  }
}
