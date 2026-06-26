/**
 * Chunked AI inventory API.
 *
 *   GET /api/ai-inventory                          -> summary counts (cheap)
 *   GET /api/ai-inventory?category=automations     -> single category
 *   GET /api/ai-inventory?category=automations&cursor=10&limit=20
 *                                                  -> paginated category
 *
 * Returns small JSON chunks (≤ 64 KB) so mobile clients can stream the
 * inventory progressively rather than block on a monolithic payload.
 * Each chunked response carries `next_cursor` (null when the category is
 * exhausted) so the client knows when to stop fetching.
 *
 * Admin-only (superadmin or tenant_admin).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import {
  CATEGORY_ORDER,
  CATEGORY_LABEL,
  fetchCategory,
  fetchSummary,
  type InventoryCategory,
} from '@/lib/ai-inventory'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_PAGE_SIZE = 50
const DEFAULT_PAGE_SIZE = 20

function isAdmin(role?: string | null): boolean {
  return ['superadmin', 'admin', 'tenant_admin'].includes((role || '').toLowerCase())
}

function isValidCategory(s: string): s is InventoryCategory {
  return (CATEGORY_ORDER as string[]).includes(s)
}

export async function GET(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(req.url)
  const category = url.searchParams.get('category')

  // Summary mode — no category param.
  if (!category) {
    const summary = await fetchSummary()
    return NextResponse.json({
      categories: CATEGORY_ORDER.map((c) => ({
        id: c,
        label: CATEGORY_LABEL[c],
        total: summary[c].total,
        active: summary[c].active,
      })),
    })
  }

  if (!isValidCategory(category)) {
    return NextResponse.json({ error: 'unknown category' }, { status: 400 })
  }

  const cursor = Math.max(0, Number(url.searchParams.get('cursor') || 0))
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get('limit') || DEFAULT_PAGE_SIZE)),
  )

  const all = await fetchCategory(category)
  const page = all.slice(cursor, cursor + limit)
  const nextCursor = cursor + page.length < all.length ? cursor + page.length : null

  return NextResponse.json({
    category,
    label: CATEGORY_LABEL[category],
    total: all.length,
    items: page,
    next_cursor: nextCursor,
  })
}
