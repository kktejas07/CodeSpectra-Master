import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { canAccessCollab } from '@/lib/collab-access'
import { collabPresences, nowIso, newId } from '@/lib/db/collab'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/collab/[session]/presence — heartbeat */
export async function POST(req: NextRequest, ctx: { params: Promise<{ session: string }> }) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { session } = await ctx.params
  if (!(await canAccessCollab(gate.user, session))) return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { cursor_line?: number; cursor_column?: number }
  const col = await collabPresences()

  // Upsert presence
  await col.updateOne(
    { session_id: session, user_id: gate.user.id },
    {
      $set: {
        user_name: gate.user.name || gate.user.email || 'Unknown',
        cursor_line: body.cursor_line || 0,
        cursor_column: body.cursor_column || 0,
        last_seen: nowIso(),
      },
      $setOnInsert: { id: newId() },
    },
    { upsert: true },
  )

  return NextResponse.json({ ok: true })
}

/** GET /api/collab/[session]/presence — list active users */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ session: string }> }) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { session } = await ctx.params
  if (!(await canAccessCollab(gate.user, session))) return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })

  const fiveMinAgo = new Date(Date.now() - 300000).toISOString()
  const col = await collabPresences()
  const active = await col.find({
    session_id: session,
    last_seen: { $gte: fiveMinAgo },
  }).toArray()

  return NextResponse.json({ presences: active.map((p) => ({
    user_name: p.user_name,
    cursor_line: p.cursor_line,
    cursor_column: p.cursor_column,
    last_seen: p.last_seen,
  })) })
}
