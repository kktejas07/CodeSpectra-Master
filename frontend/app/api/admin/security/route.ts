import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { invalidateSecurityPolicyCache } from '@/lib/db/security'
import { auditAdmin } from '@/lib/admin-audit'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const db = await getMongoDb()
    const data = await db.collection('security_settings').find({}).toArray()
    return NextResponse.json({ data })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function PATCH(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const { name, status, allowed_ips, limit } = await request.json()
    if (!name || !['enabled', 'disabled'].includes(status)) {
      return NextResponse.json({ error: 'name and status (enabled|disabled) required' }, { status: 400 })
    }
    const db = await getMongoDb()
    const set: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
    if (Array.isArray(allowed_ips)) set.allowed_ips = allowed_ips.filter((x: unknown) => typeof x === 'string')
    if (typeof limit === 'number') set.limit = limit
    await db.collection('security_settings').updateOne(
      { name },
      { $set: set },
      { upsert: true },
    )
    invalidateSecurityPolicyCache()
    await auditAdmin(gate.user, 'admin.security_policy.update', 'settings', `security/${String(name)}`, `status: ${status}`, 'warning')
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
