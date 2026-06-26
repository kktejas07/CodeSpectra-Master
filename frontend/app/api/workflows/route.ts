/**
 * Workflows CRUD (superadmin only).
 *   GET  /api/workflows         -> list
 *   POST /api/workflows         -> create
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import {
  workflows,
  newId,
  nowIso,
  type WorkflowDoc,
} from '@/lib/db/leaderboard'

export const runtime = 'nodejs'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const col = await workflows()
  const items = await col
    .find({}, { projection: { _id: 0 } })
    .sort({ created_at: -1 })
    .toArray()
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  let body: Partial<WorkflowDoc>
  try {
    body = (await req.json()) as Partial<WorkflowDoc>
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const doc: WorkflowDoc = {
    id: newId(),
    name: body.name,
    description: body.description || '',
    trigger: body.trigger || 'manual',
    is_active: body.is_active ?? true,
    nodes: body.nodes || [
      { id: 't1', type: 'trigger.manual', label: 'Start' },
      { id: 'l1', type: 'log', label: 'Hello', config: { message: 'Hello from CodeSpectra!' } },
    ],
    edges: body.edges || [{ from: 't1', to: 'l1' }],
    created_by: gate.user.id,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  const col = await workflows()
  await col.insertOne(doc)
  // Strip Mongo `_id` injected by insertOne to keep the response contract
  // identical to GET (which projects `_id: 0`). Clients should key off `id`.
  const { _id: _ignored, ...clean } = doc as WorkflowDoc & { _id?: unknown }
  void _ignored
  return NextResponse.json(clean, { status: 201 })
}