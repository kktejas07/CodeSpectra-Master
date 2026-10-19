/**
 * GET /api/marketplace/products/[slug]/slots?from=ISO&days=14 — bookable session starts
 * (UTC ISO). The client shows them in the buyer's own time zone.
 */
import { NextRequest, NextResponse } from 'next/server'
import { limitRequest } from '@/lib/rate-limit'
import { getProductBySlug } from '@/lib/marketplace/catalog'
import { availableSlots } from '@/lib/marketplace/booking'
import { errorResponse } from '@/lib/marketplace/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const limited = await limitRequest(req, 'mkt-slots', null, 60, 60_000)
  if (limited) return limited
  const { slug } = await params
  try {
    const found = await getProductBySlug(slug)
    if (!found || found.raw.kind !== 'service') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const fromRaw = Date.parse(req.nextUrl.searchParams.get('from') || '')
    const from = Number.isFinite(fromRaw) ? Math.max(fromRaw, Date.now()) : Date.now()
    const days = Math.min(31, Math.max(1, Number(req.nextUrl.searchParams.get('days')) || 14))
    const slots = await availableSlots(found.raw, from, from + days * 86_400_000)
    return NextResponse.json({ slots, timezone: found.raw.service?.timezone ?? 'UTC', duration_min: found.raw.service?.duration_min ?? 0 }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return errorResponse(e, 'slots')
  }
}
