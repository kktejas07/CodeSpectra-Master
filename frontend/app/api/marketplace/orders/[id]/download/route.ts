/**
 * POST /api/marketplace/orders/[id]/download { line_id, file_id } → { url, expires_in, downloads_left }
 * A signed link valid for 5 minutes, bound to this buyer; each use spends one download.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import type { IdRouteContext } from '@/lib/app-route-context'
import { issueDownloadLink } from '@/lib/marketplace/digital'
import { errorResponse } from '@/lib/marketplace/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ID = /^[A-Za-z0-9_-]{1,80}$/

export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const limited = await limitRequest(req, 'mkt-dl-link', gate.user.id, 30, 60_000)
  if (limited) return limited
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { line_id?: unknown; file_id?: unknown }
  if (typeof body.line_id !== 'string' || !ID.test(body.line_id) || typeof body.file_id !== 'string' || !ID.test(body.file_id)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  try {
    return NextResponse.json(await issueDownloadLink(gate.user.id, id, body.line_id, body.file_id))
  } catch (e) {
    return errorResponse(e, 'download link')
  }
}
