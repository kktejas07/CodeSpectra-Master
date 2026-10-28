import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

// GET /api/admin/security/fingerprints
// Lists device fingerprints with account counts, multi-account risk, and block state.
export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')
    const riskOnly = searchParams.get('riskOnly') === 'true'
    const db = await getMongoDb()

    const match: Record<string, unknown> = {}
    if (riskOnly) {
      match.$expr = { $gt: [{ $size: '$accounts' }, 1] }
    }
    if (q) {
      match.$or = [
        { visitorId: { $regex: q, $options: 'i' } },
        { 'accounts.email': { $regex: q, $options: 'i' } },
      ]
    }

    const data = await db.collection('device_fingerprints')
      .aggregate([
        { $match: match },
        {
          $addFields: {
            account_count: { $size: { $ifNull: ['$accounts', []] } },
            risk: { $gt: [{ $size: { $ifNull: ['$accounts', []] } }, 1] },
          },
        },
        { $sort: { last_seen: -1 } },
        { $limit: 200 },
      ])
      .toArray()

    const total = await db.collection('device_fingerprints').countDocuments({})
    const riskCount = await db.collection('device_fingerprints').aggregate([
      { $match: { $expr: { $gt: [{ $size: '$accounts' }, 1] } } },
      { $count: 'n' },
    ]).toArray().then(r => r[0]?.n || 0)
    const blockedCount = await db.collection('device_fingerprints').countDocuments({ is_blocked: true })

    return NextResponse.json({ data, total, riskCount, blockedCount })
  } catch (e) {
    console.error('[security/fingerprints] Error:', e)
    return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 })
  }
}

// POST /api/admin/security/fingerprints  { visitorId, action: 'block' | 'unblock', reason? }
export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const body = await req.json()
    const visitorId = String(body.visitorId || '').trim()
    const action = body.action
    if (!visitorId || !['block', 'unblock'].includes(action)) {
      return NextResponse.json({ error: 'visitorId and action (block|unblock) required' }, { status: 400 })
    }

    const db = await getMongoDb()
    const set: Record<string, unknown> = { is_blocked: action === 'block' }
    if (action === 'block') {
      set.blocked_at = new Date().toISOString()
      set.blocked_reason = String(body.reason || 'Blocked by superadmin').slice(0, 300)
    } else {
      set.blocked_at = null
      set.blocked_reason = null
    }
    await db.collection('device_fingerprints').updateOne({ visitorId }, { $set: set })

    const fpDoc = await db.collection('device_fingerprints').findOne({ visitorId })
    const emails = (fpDoc?.accounts || []).map((a: { email: string }) => a.email)
    await db.collection('security_events').insertOne({
      id: (await import('node:crypto')).randomUUID(),
      ts: new Date().toISOString(),
      type: action === 'block' ? 'admin.block_fingerprint' : 'admin.unblock_fingerprint',
      severity: action === 'block' ? 'critical' : 'info',
      visitorId,
      detail: action === 'block'
        ? `Fingerprint blocked by ${gate.user.email}. Accounts: ${emails.join(', ') || 'none'}`
        : `Fingerprint unblocked by ${gate.user.email}`,
      metadata: { reason: body.reason },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 })
  }
}
