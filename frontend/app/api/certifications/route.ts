/**
 * GET /api/certifications
 *
 * Chunked catalog endpoint. Query params:
 *   - category   : 'skill' | 'role'  (optional)
 *   - cursor     : opaque pagination cursor (created_at iso string)
 *   - limit      : 1..50 (default 20)
 *
 * Public — anyone can view the catalog so unauthenticated visitors can
 * browse certifications before signing up. Attempts require auth.
 *
 * Seeds the open-source modules on first call if the collection is empty.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  certifications,
  publicCertView,
  seedCertificationsIfEmpty,
} from '@/lib/db/certifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const col = await certifications()
  let count = await col.countDocuments({})
  if (count === 0) {
    await seedCertificationsIfEmpty()
    count = await col.countDocuments({})
  }

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const cursor = searchParams.get('cursor')
  const limitRaw = Number(searchParams.get('limit') || 20)
  const limit = Math.max(1, Math.min(50, Number.isFinite(limitRaw) ? limitRaw : 20))

  const query: Record<string, unknown> = { is_active: true }
  if (category === 'skill' || category === 'role') {
    query.category = category
  }
  if (cursor) {
    query.created_at = { $lt: cursor }
  }

  const docs = await col
    .find(query)
    .sort({ created_at: -1 })
    .limit(limit + 1)
    .toArray()

  const hasMore = docs.length > limit
  const page = hasMore ? docs.slice(0, limit) : docs
  const nextCursor = hasMore ? page[page.length - 1].created_at : null

  return NextResponse.json({
    items: page.map(publicCertView),
    next_cursor: nextCursor,
    has_more: hasMore,
    total: count,
  })
}
