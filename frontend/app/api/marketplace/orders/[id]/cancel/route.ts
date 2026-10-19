/**
 * POST /api/marketplace/orders/[id]/cancel { line_ids? } — unpaid order: release it;
 * paid lines: cancel within policy (before dispatch / booking cutoff / never downloaded)
 * and refund through the gateway at once.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import type { IdRouteContext } from '@/lib/app-route-context'
import { cancelByBuyer } from '@/lib/marketplace/orders'
import { errorResponse } from '@/lib/marketplace/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const limited = await limitRequest(req, 'mkt-cancel', gate.user.id, 10, 10 * 60_000)
  if (limited) return limited
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { line_ids?: unknown }
  try {
    return NextResponse.json({ ok: true, result: await cancelByBuyer(gate.user.id, id, body.line_ids) })
  } catch (e) {
    return errorResponse(e, 'cancel')
  }
}
