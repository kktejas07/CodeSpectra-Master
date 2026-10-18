import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireSuperAdmin } from '@/lib/route-auth'
import { adminAuditLogs, writeAuditLog } from '@/lib/db/misc'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ACTION_RE = /^[a-z][a-z0-9_.:-]{0,63}$/

/**
 * POST /api/admin/audit-log — record a client-side admin action (e.g. a
 * results-page release). Superadmin or tenant admin; tenant admin entries are
 * stamped with their tenant. Written to `admin_audit_logs`, the same
 * collection /api/admin/audit-logs and the security dashboard read.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const body = await req.json().catch(() => ({})) as { action?: unknown; target?: unknown; details?: unknown }
  const action = typeof body.action === 'string' ? body.action.trim() : ''
  const target = typeof body.target === 'string' ? body.target.trim().slice(0, 200) : ''
  const details = typeof body.details === 'string' ? body.details.slice(0, 1000) : undefined
  if (!ACTION_RE.test(action) || !target) {
    return NextResponse.json({ error: 'action and target are required' }, { status: 400 })
  }

  try {
    await writeAuditLog({
      action,
      outcome: 'success',
      actor: gate.user.id,
      actorIp: clientLimiterKeyFromRequest(req, null),
      resource: target,
      resourceType: 'client_action',
      severity: 'info',
      detail: details,
      user_id: gate.user.id,
      tenant_id: gate.user.role === 'tenant_admin' ? gate.user.tenantId ?? null : null,
    })
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
    const col = await adminAuditLogs()
    const entries = await col.find({}, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(100).toArray()
    return NextResponse.json({ entries })
  } catch (e) {
    console.error('[audit-log GET] error:', e)
    return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 })
  }
}
