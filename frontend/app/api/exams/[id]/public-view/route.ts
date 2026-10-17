/**
 * POST /api/exams/[id]/public-view — track a public/share-link view.
 * Increments `public_link_views` on the exam document. Fire-and-forget.
 */
import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import type { IdRouteContext } from '@/lib/app-route-context'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: IdRouteContext) {
  try {
    const { id } = await params
    // Count at most one view per visitor per exam per hour (stops counter inflation).
    const key = clientLimiterKeyFromRequest(req, null)
    const rl = await rateLimitRedis(`exam-public-view:${String(id).slice(0, 64)}:${key}`, 1, 60 * 60_000)
    if (!rl.ok) return NextResponse.json({ ok: true })
    const db = await getMongoDb()
    await db.collection('exams').updateOne(
      { id },
      { $inc: { public_link_views: 1 } },
    )
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true }) // best-effort — don't block the candidate
  }
}
