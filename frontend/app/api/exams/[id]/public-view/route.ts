/**
 * POST /api/exams/[id]/public-view — track a public/share-link view.
 * Increments `public_link_views` on the exam document. Fire-and-forget.
 */
import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import type { IdRouteContext } from '@/lib/app-route-context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: IdRouteContext) {
  try {
    const { id } = await params
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
