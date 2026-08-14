import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/ai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const db = await getMongoDb()
    const entries = await db.collection('ip_blocklist')
      .find({})
      .sort({ created_at: -1 })
      .toArray()

    return NextResponse.json({ entries })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load blocklist'
    console.error('[CodeSpectra] ip-blocklist GET:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const body = await req.json().catch(() => ({})) as {
      ip?: string
      reason?: string
    }

    if (!body.ip) {
      return NextResponse.json({ error: 'IP address is required' }, { status: 400 })
    }

    const db = await getMongoDb()

    const existing = await db.collection('ip_blocklist').findOne({ ip: body.ip })
    if (existing) {
      return NextResponse.json({ error: 'IP is already blocked' }, { status: 409 })
    }

    await db.collection('ip_blocklist').insertOne({
      ip: body.ip,
      reason: body.reason || '',
      blocked_by: gate.user.id,
      created_at: nowIso(),
    })

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to block IP'
    console.error('[CodeSpectra] ip-blocklist POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const { searchParams } = new URL(req.url)
    const ip = searchParams.get('ip')

    if (!ip) {
      return NextResponse.json({ error: 'IP address is required' }, { status: 400 })
    }

    const db = await getMongoDb()
    const result = await db.collection('ip_blocklist').deleteOne({ ip })

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'IP not found in blocklist' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to remove IP'
    console.error('[CodeSpectra] ip-blocklist DELETE:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
