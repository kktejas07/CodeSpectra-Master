/**
 * GET    /api/admin/analytics/feature-flags — list flags
 * POST   /api/admin/analytics/feature-flags — create flag
 * PATCH  /api/admin/analytics/feature-flags — update flag
 * DELETE /api/admin/analytics/feature-flags?id=xxx — delete flag
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { featureFlags, newId, nowIso } from '@/lib/db/misc'
import { auditAdmin } from '@/lib/admin-audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── GET: list flags ─────────────────────────────────────────────────────────

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const col = await featureFlags()
  const flags = await col.find({}).sort({ created_at: -1 }).limit(100).toArray()
  return NextResponse.json({ flags })
}

// ─── POST: create flag ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const name = String(body.name || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_')
  const description = String(body.description || '').trim()
  const enabled = body.enabled !== false
  const percentage = Math.min(Math.max(Number(body.percentage) || 100, 0), 100)
  const allowedUsers = Array.isArray(body.allowed_users) ? body.allowed_users.map(String) : []

  if (!name) {
    return NextResponse.json({ error: 'Name required' }, { status: 400 })
  }

  const col = await featureFlags()
  const existing = await col.findOne({ id: name })
  if (existing) {
    return NextResponse.json({ error: 'Flag already exists' }, { status: 409 })
  }

  const doc = {
    id: name,
    name,
    description,
    enabled,
    percentage,
    allowed_users: allowedUsers,
    created_at: nowIso(),
    created_by: gate.user.id,
  }

  await col.insertOne(doc as any)
  await auditAdmin(gate.user, 'admin.feature_flag.create', 'feature_flag', `flag/${name}`)
  return NextResponse.json({ ok: true, flag: doc })
}

// ─── PATCH: update flag ─────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const name = String(body.name || '').trim()
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const col = await featureFlags()
  const update: Record<string, unknown> = { updated_at: nowIso() }
  if (typeof body.enabled === 'boolean') update.enabled = body.enabled
  if (typeof body.percentage === 'number') update.percentage = Math.min(Math.max(body.percentage, 0), 100)
  if (typeof body.description === 'string') update.description = body.description
  if (Array.isArray(body.allowed_users)) update.allowed_users = body.allowed_users.map(String)

  await col.updateOne({ id: name }, { $set: update })
  await auditAdmin(gate.user, 'admin.feature_flag.update', 'feature_flag', `flag/${name}`, Object.keys(update).join(', '))
  return NextResponse.json({ ok: true })
}

// ─── DELETE: remove flag ────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { searchParams } = new URL(req.url)
  const name = searchParams.get('id')
  if (!name) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const col = await featureFlags()
  await col.deleteOne({ id: name })
  await auditAdmin(gate.user, 'admin.feature_flag.delete', 'feature_flag', `flag/${name}`, undefined, 'warning')
  return NextResponse.json({ ok: true })
}
