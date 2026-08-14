import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const body = await req.json().catch(() => ({})) as { action?: string; target?: string; details?: string }

  if (!body.action || !body.target) {
    return NextResponse.json({ error: 'action and target are required' }, { status: 400 })
  }

  try {
    const db = await getMongoDb()
    const entry = {
      id: newId(),
      user_id: gate.user.id,
      user_email: gate.user.email,
      action: body.action,
      target: body.target,
      details: body.details || null,
      created_at: nowIso(),
    }
    await db.collection('admin_audit_log').insertOne(entry)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[audit-log POST] error:', e)
    return NextResponse.json({ error: 'Failed to record audit log' }, { status: 500 })
  }
}

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const db = await getMongoDb()
    const entries = await db.collection('admin_audit_log')
      .find({})
      .sort({ created_at: -1 })
      .limit(100)
      .toArray()

    return NextResponse.json({ entries })
  } catch (e) {
    console.error('[audit-log GET] error:', e)
    return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 })
  }
}
