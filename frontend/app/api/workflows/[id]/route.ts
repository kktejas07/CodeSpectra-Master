/**
 * Per-workflow operations (superadmin only).
 *   GET    /api/workflows/[id]         -> fetch
 *   PATCH  /api/workflows/[id]         -> update name / nodes / edges / active
 *   DELETE /api/workflows/[id]         -> remove
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { workflows, nowIso, type WorkflowDoc } from '@/lib/db/leaderboard'

export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await ctx.params
  const col = await workflows()
  const doc = await col.findOne({ id }, { projection: { _id: 0 } })
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(doc)
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await ctx.params
  let body: Partial<WorkflowDoc>
  try {
    body = (await req.json()) as Partial<WorkflowDoc>
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const $set: Record<string, unknown> = { updated_at: nowIso() }
  for (const k of ['name', 'description', 'trigger', 'cron_expression', 'is_active', 'nodes', 'edges'] as const) {
    if (k in body) $set[k] = body[k]
  }
  const col = await workflows()
  await col.updateOne({ id }, { $set })
  const updated = await col.findOne({ id }, { projection: { _id: 0 } })
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await ctx.params
  const col = await workflows()
  await col.deleteOne({ id })
  return NextResponse.json({ ok: true })
}
