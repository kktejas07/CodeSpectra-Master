/** POST /api/marketplace/products/[slug]/reviews { rating 1–5, title?, body? } — verified buyers only. */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { productsCol } from '@/lib/marketplace/db'
import { createReview } from '@/lib/marketplace/reviews'
import { errorResponse } from '@/lib/marketplace/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: 'Sign in to write a review.' }, { status: gate.status })
  const limited = await limitRequest(req, 'mkt-review', gate.user.id, 10, 60 * 60_000)
  if (limited) return limited
  const { slug } = await params
  if (!/^[a-z0-9-]{1,120}$/i.test(slug)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const p = await (await productsCol()).findOne({ slug }, { projection: { _id: 0, id: 1 } })
    if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const r = await createReview(gate.user.id, p.id, await req.json().catch(() => null))
    return NextResponse.json({ ok: true, status: r.status, message: r.status === 'published' ? 'Thanks — your review is live.' : 'Thanks — your review will appear after a quick check.' })
  } catch (e) {
    return errorResponse(e, 'review')
  }
}
