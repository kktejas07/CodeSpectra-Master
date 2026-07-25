import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { readServerSecrets } from '@/lib/server-secrets-cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function cfFetch(token: string, path: string) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Cloudflare API ${res.status}`)
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

    const [dash, countries] = await Promise.all([
      cfFetch(apiToken, `/zones/${zoneId}/analytics/dashboard?since=${since}&until=${until}`),
      cfFetch(apiToken, `/zones/${zoneId}/analytics/dashboard?since=${since}&until=${until}`),
    ])

    if (!dash.success && !countries.success) {
      throw new Error('Cloudflare API returned errors')
    }

    const d = (dash.result || {}) as Record<string, any>
    const requests = d.requests || {}
    const bandwidth = d.bandwidth || {}

    const totalRequests = requests.throughput_all || requests.cached || 0
    const totalCached = requests.cached || 0
    const totalBytes = bandwidth.pure_uniques || 0
    const totalUniques = requests.uniques || 0

    return NextResponse.json({
      configured: true,
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
    return NextResponse.json({ configured: true, error: (e as Error).message }, { status: 502 })
  }
}
