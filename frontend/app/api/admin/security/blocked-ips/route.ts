import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { blockIp, unblockIp } from '@/lib/db/security'
import { sanitizeRegex } from '@/lib/sanitize'

export const runtime = 'nodejs'

// GET /api/admin/security/blocked-ips
export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')
    const db = await getMongoDb()
    const filter: Record<string, unknown> = {}
    if (q) filter.ip = { $regex: sanitizeRegex(q), $options: 'i' }
    const data = await db.collection('security_blocklist')
      .find(filter)
      .sort({ blocked_at: -1 })
      .limit(100)
      .toArray()
    const active = data.filter((d: any) => d.active !== false).length
    return NextResponse.json({ data, active })
  } catch {
    return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 })
  }
}

// POST /api/admin/security/blocked-ips  { ip, reason, expiresAt? }
export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const body = await req.json()
    const ip = String(body.ip || '').trim()
    const reason = String(body.reason || 'Manual block by admin').trim()
    const expiresAt = typeof body.expiresAt === 'string' && body.expiresAt ? body.expiresAt : undefined

    if (!ip) return NextResponse.json({ error: 'IP is required' }, { status: 400 })
    if (!/^[0-9a-fA-F:.\s]+$/.test(ip) || ip.length > 45) {
      return NextResponse.json({ error: 'Invalid IP address' }, { status: 400 })
    }

    await blockIp({ ip, reason, actor: gate.user.email, expiresAt })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 })
  }
}

// DELETE /api/admin/security/blocked-ips?ip=1.2.3.4
export async function DELETE(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const { searchParams } = new URL(req.url)
    const ip = searchParams.get('ip') || ''
    if (!ip) return NextResponse.json({ error: 'ip query param required' }, { status: 400 })
    await unblockIp(ip, gate.user.email)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 })
  }
}
