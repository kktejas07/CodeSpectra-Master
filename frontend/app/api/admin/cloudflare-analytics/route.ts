import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { readServerSecrets } from '@/lib/server-secrets-cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function graphQLQuery(token: string, query: string) {
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`Cloudflare GraphQL API: ${res.status}`)
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
    const [trafficResult, countriesResult] = await Promise.all([
      graphQLQuery(apiToken, `{
        viewer { zones(filter: {zoneTag: "${zoneId}"}) {
          httpRequests1mGroups(limit: 30, orderBy: [datetime_DESC]) {
            dimensions { datetime }
            sum { requests bytes cachedRequests }
            uni { uniques }
          }
        }}
      }`),
      graphQLQuery(apiToken, `{
        viewer { zones(filter: {zoneTag: "${zoneId}"}) {
          httpRequests1hGroups(limit: 50, orderBy: [count_DESC]) {
            dimensions { countryName }
            count
          }
        }}
      }`),
    ])

    const traffic = trafficResult?.data?.viewer?.zones?.[0]?.httpRequests1mGroups || []
    const countries = countriesResult?.data?.viewer?.zones?.[0]?.httpRequests1hGroups || []

    const totalRequests = traffic.reduce((s: number, g: any) => s + (g.sum?.requests || 0), 0)
    const totalCached = traffic.reduce((s: number, g: any) => s + (g.sum?.cachedRequests || 0), 0)
    const totalBytes = traffic.reduce((s: number, g: any) => s + (g.sum?.bytes || 0), 0)
    const totalUniques = traffic.reduce((s: number, g: any) => s + (g.uni?.uniques || 0), 0)

    const topCountries = countries
      .filter((c: any) => c.dimensions?.countryName)
      .slice(0, 10)
      .map((c: any) => ({
        country: c.dimensions.countryName,
        requests: c.count,
      }))

    return NextResponse.json({
      configured: true,
      traffic: {
        requests: totalRequests,
        cached: totalCached,
        bytes: totalBytes,
        uniques: totalUniques,
        cacheRatio: totalRequests > 0 ? Math.round((totalCached / totalRequests) * 100) : 0,
      },
      topCountries,
    })
  } catch (e) {
    return NextResponse.json({ configured: true, error: (e as Error).message }, { status: 502 })
  }
}
