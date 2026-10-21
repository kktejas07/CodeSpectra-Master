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

// The AI inventory is platform-wide (no tenant scoping): superadmin only,
// matching the page guard.
function isAdmin(role?: string | null): boolean {
  return role === 'superadmin'
}

function isValidCategory(s: string): s is InventoryCategory {
  return (CATEGORY_ORDER as string[]).includes(s)
}

export async function GET(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
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

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { id, category, name, purpose, module, status, source, version } = body
    if (!id || !category || !name) {
      return NextResponse.json({ error: 'id, category, and name are required' }, { status: 400 })
    }
    if (!isValidCategory(category)) {
      return NextResponse.json({ error: 'invalid category' }, { status: 400 })
    }

    const { getMongoDb } = await import('@/lib/mongodb')
    const db = await getMongoDb()
    const col = db.collection('custom_ai_components')
    const now = new Date().toISOString()
    const doc = {
      id: String(id),
      category,
      name: String(name),
      purpose: purpose || '',
      module: module || 'custom',
      status: status || 'active',
      source: source || '',
      version: version || '1.0',
      created_at: now,
      updated_at: now,
    }
    await col.updateOne({ id: String(id) }, { $set: doc }, { upsert: true })

    return NextResponse.json({ ok: true, item: doc })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error', code: 'internal_error' }, { status: 500 })
  }
}
