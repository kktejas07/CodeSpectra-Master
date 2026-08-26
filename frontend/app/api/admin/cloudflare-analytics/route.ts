import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { readServerSecrets } from '@/lib/server-secrets-cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function cfGraphQL(token: string, query: string, variables?: Record<string, unknown>) {
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Cloudflare API ${res.status}: ${await res.text()}`)
  const json = await res.json()
  if (json.errors?.length) throw new Error(json.errors[0].message)
  return json
}

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
  const zoneId = (secrets.cloudflare_zone_id?.trim() || '') || process.env.CLOUDFLARE_ZONE_ID?.trim() || ''
  const apiToken = (secrets.cloudflare_api_token?.trim() || '') || process.env.CLOUDFLARE_API_TOKEN?.trim() || ''
  if (!zoneId || !apiToken) {
    return NextResponse.json({ configured: false, error: 'Cloudflare not configured' })
  }

  try {
    const nowMs = Date.now()
    const sinceSec = Math.floor(nowMs / 1000) - 259200 // 3 days
    const since = new Date(sinceSec * 1000).toISOString()
    const until = new Date(Math.floor(nowMs / 1000) * 1000).toISOString()

    // Get zone name
    const zoneResult = await cfFetch(apiToken, `/zones/${zoneId}`)
    const zoneName = (zoneResult.result as any)?.name || ''

    // GraphQL: HTTP request totals (3-day hourly groups)
    const gqlResult = await cfGraphQL(
      apiToken,
      `query GetZoneMetrics($zoneTag: String!, $since: String!, $until: String!) {
        viewer {
          zones(filter: {zoneTag: $zoneTag}) {
            httpRequests1hGroups(
              limit: 72,
              filter: {datetime_geq: $since, datetime_leq: $until}
            ) {
              sum {
                bytes
                cachedBytes
                requests
                cachedRequests
              }
              uniq {
                uniques
              }
              dimensions {
                datetime
              }
            }
          }
        }
      }`,
      { zoneTag: zoneId, since, until }
    )

    const groups = gqlResult?.data?.viewer?.zones?.[0]?.httpRequests1hGroups || []
    const totals = { bytes: 0, cachedBytes: 0, requests: 0, cachedRequests: 0, uniques: 0 }
    const timeSeries: Array<{ datetime: string; requests: number; cached: number; bandwidth: number }> = []

    for (const g of groups as any[]) {
      if (g.sum) {
        totals.bytes += g.sum.bytes || 0
        totals.cachedBytes += g.sum.cachedBytes || 0
        totals.requests += g.sum.requests || 0
        totals.cachedRequests += g.sum.cachedRequests || 0
      }
      if (g.uniq) {
        totals.uniques += g.uniq.uniques || 0
      }
      if (g.dimensions?.datetime) {
        timeSeries.push({
          datetime: g.dimensions.datetime,
          requests: g.sum?.requests || 0,
          cached: g.sum?.cachedRequests || 0,
          bandwidth: g.sum?.bytes || 0,
        })
      }
    }

    // GraphQL: Per-country request counts
    const countryResult = await cfGraphQL(
      apiToken,
      `query GetCountryMetrics($zoneTag: String!, $since: String!, $until: String!) {
        viewer {
          zones(filter: {zoneTag: $zoneTag}) {
            httpRequests1hGroups(
              limit: 100,
              filter: {datetime_geq: $since, datetime_leq: $until},
              orderBy: [sum_requests_DESC]
            ) {
              dimensions {
                clientCountryName
              }
              sum {
                requests
              }
            }
          }
        }
      }`,
      { zoneTag: zoneId, since, until }
    )

    const countryGroups = countryResult?.data?.viewer?.zones?.[0]?.httpRequests1hGroups || []
    const countryMap = new Map<string, number>()
    for (const g of countryGroups as any[]) {
      const name = g?.dimensions?.clientCountryName || 'Unknown'
      countryMap.set(name, (countryMap.get(name) || 0) + (g?.sum?.requests || 0))
    }
    const topCountries = Array.from(countryMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([country, requests]) => ({ country, requests }))

    // Estimate real-time visitors from recent hourly data
    const recentHours = timeSeries.slice(-3)
    const avgRequestsPerHour = recentHours.reduce((sum, h) => sum + h.requests, 0) / Math.max(recentHours.length, 1)
    const estimatedConcurrent = Math.max(1, Math.round(avgRequestsPerHour / 60)) // rough per-minute

    return NextResponse.json({
      configured: true,
      zone: zoneName,
      traffic: {
        requests: totals.requests,
        cached: totals.cachedRequests,
        bytes: totals.bytes,
        uniques: totals.uniques,
        cacheRatio: totals.requests > 0 ? Math.round((totals.cachedRequests / totals.requests) * 100) : 0,
      },
      topCountries,
      timeSeries,
      realtime: {
        estimatedVisitorsPerMinute: estimatedConcurrent,
        requestsPerHour: Math.round(avgRequestsPerHour),
      },
    })
  } catch (e) {
    const msg = (e as Error).message
    if (
      msg.includes('Authentication error') ||
      msg.includes('Invalid token') ||
      msg.includes('10000') ||
      msg.includes('forbidden') ||
      msg.includes('Unauthorized')
    ) {
      return NextResponse.json({ configured: false, error: 'Invalid or expired Cloudflare API token' })
    }
    if (msg.includes('zone not found') || msg.includes('No zone')) {
      return NextResponse.json({ configured: false, error: 'Cloudflare zone not found — check Zone ID' })
    }
    return NextResponse.json({ configured: false, error: 'Cloudflare: ' + msg }, { status: 200 })
  }
}
