/**
 * Single item CRUD for AI inventory (`/api/ai-inventory/[id]`).
 *
 *   GET    /api/ai-inventory/[id] -> fetch single item + overrides
 *   PATCH  /api/ai-inventory/[id] -> update status/purpose/version override
 *   DELETE /api/ai-inventory/[id] -> delete override or custom component
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { CATEGORY_ORDER, fetchCategory, type InventoryCategory } from '@/lib/ai-inventory'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The AI inventory is platform-wide (no tenant scoping): superadmin only,
// matching the page guard.
function isAdmin(role?: string | null): boolean {
  return role === 'superadmin'
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  if (!isAdmin(user.role)) return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })

  const { id } = await params
  for (const cat of CATEGORY_ORDER) {
    const items = await fetchCategory(cat)
    const found = items.find((it) => it.id === id)
    if (found) {
      return NextResponse.json({ ok: true, item: found })
    }
  }
  return NextResponse.json({ error: 'Item not found', code: 'cart_item_not_found' }, { status: 404 })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  if (!isAdmin(user.role)) return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })

  try {
    const body = await req.json()
    const { category, status, purpose, version } = body
    if (!category) {
      return NextResponse.json({ error: 'category is required' }, { status: 400 })
    }

    const db = await getMongoDb()
    const overridesCol = db.collection('ai_inventory_overrides')
    const now = new Date().toISOString()
    const { id: itemId } = await params

    const updateFields: Record<string, unknown> = { updated_at: now }
    if (status !== undefined) updateFields.status = status
    if (purpose !== undefined) updateFields.purpose = purpose
    if (version !== undefined) updateFields.version = version

    await overridesCol.updateOne(
      { id: itemId, category },
      {
        $set: {
          id: itemId,
          category,
          ...updateFields,
        },
      },
      { upsert: true }
    )

    // Also check if it's in custom_ai_components
    const customCol = db.collection('custom_ai_components')
    await customCol.updateOne(
      { id: itemId },
      { $set: updateFields }
    )

    return NextResponse.json({ ok: true, id: itemId, category, ...updateFields })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error', code: 'internal_error' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  if (!isAdmin(user.role)) return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })

  try {
    const db = await getMongoDb()
    const { id: itemId } = await params
    await db.collection('ai_inventory_overrides').deleteOne({ id: itemId })
    await db.collection('custom_ai_components').deleteOne({ id: itemId })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error', code: 'internal_error' }, { status: 500 })
  }
}
