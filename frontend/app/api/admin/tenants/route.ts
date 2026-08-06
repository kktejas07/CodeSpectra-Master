import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/api-auth'
import { tenants, newId, nowIso } from '@/lib/db/admin'
import { getMongoDb } from '@/lib/mongodb'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const col = await tenants()
    const list = await col.find({}).sort({ created_at: -1 }).toArray()

    const db = await getMongoDb()
    const userCol = db.collection('user')
    const rows = await Promise.all(list.map(async (t) => {
      const memberCount = await userCol.countDocuments({ tenantId: t.id })
      return { ...t, member_count: memberCount }
    }))

    return NextResponse.json({ data: rows })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to list tenants'
    console.error('[CodeSpectra] admin/tenants GET:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  let body: { name?: string; slug?: string; plan?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = (body.name || '').trim()
  if (!name) {
    return NextResponse.json({ error: 'Tenant name is required' }, { status: 400 })
  }

  try {
    const col = await tenants()
    const slugBase = (body.slug || name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    let slug = slugBase || `org-${Date.now()}`
    const existing = await col.findOne({ slug })
    if (existing) slug = `${slugBase}-${Date.now().toString(36)}`

    const doc = {
      id: newId(),
      name,
      slug,
      plan: body.plan || 'enterprise',
      is_active: true,
      created_at: nowIso(),
      created_by: gate.user.id,
    }
    await col.insertOne(doc)
    return NextResponse.json({ data: { ...doc, member_count: 0 } }, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to create tenant'
    console.error('[CodeSpectra] admin/tenants POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
