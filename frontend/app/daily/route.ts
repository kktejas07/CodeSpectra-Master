/**
 * GET /daily — "Daily challenge" app shortcut (app/manifest.ts): redirects to
 * today's problem (same pick as /api/daily-challenge). The problem page does
 * its own sign-in / access checks.
 */
import { NextResponse } from 'next/server'
import { problems } from '@/lib/db/problems'
import { dailyIndex, todayKey } from '@/lib/pwa/offline-payload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const base = new URL(req.url)
  let target = '/dashboard'
  try {
    const list = await (await problems())
      .find({ is_published: true, hackathon_id: null, visibility: { $ne: 'hackathon_only' } }, { projection: { id: 1, slug: 1 } })
      .sort({ id: 1 })
      .toArray()
    const idx = dailyIndex(todayKey(), list.length)
    const slug = idx >= 0 ? list[idx]?.slug : null
    if (typeof slug === 'string' && /^[a-z0-9-]{1,200}$/i.test(slug)) target = `/dashboard/problems/${slug}`
  } catch (e) {
    console.error('[daily] lookup failed:', (e as Error)?.message)
  }
  const source = base.searchParams.get('source')
  const location = source && /^[a-z-]{1,32}$/.test(source) ? `${target}?source=${source}` : target
  // Relative Location: correct behind the TLS proxy without trusting the Host header.
  return new NextResponse(null, { status: 307, headers: { Location: location, 'Cache-Control': 'private, no-store' } })
}
