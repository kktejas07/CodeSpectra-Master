/**
 * POST /api/marketplace/orders/[id]/refund { line_ids, reason } — refund / return request.
 * Digital (never downloaded) and services (before the cutoff) are refunded at once;
 * physical returns open a request the admin decides (lib/marketplace/moderation.ts).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import type { IdRouteContext } from '@/lib/app-route-context'
import { requestRefund } from '@/lib/marketplace/orders'
import { errorResponse } from '@/lib/marketplace/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const limited = await limitRequest(req, 'mkt-refund', gate.user.id, 10, 10 * 60_000)
  if (limited) return limited
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { line_ids?: unknown; reason?: unknown }
  try {
    return NextResponse.json({ ok: true, ...(await requestRefund(gate.user.id, id, body.line_ids, body.reason)) })
  } catch (e) {
    return errorResponse(e, 'refund request')
  }
}
