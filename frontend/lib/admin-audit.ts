/**
 * One-line audit trail for admin mutations (writes `admin_audit_logs` via
 * lib/db/misc writeAuditLog, which never throws).
 */
import 'server-only'
import { headers } from 'next/headers'
import { writeAuditLog } from '@/lib/db/misc'

export async function auditAdmin(
  actor: { id: string },
  action: string,
  resourceType: string,
  resource: string,
  detail?: string,
  severity: 'info' | 'warning' | 'critical' = 'info',
): Promise<void> {
  let actorIp = ''
  try {
    const h = await headers()
    actorIp = (h.get('x-forwarded-for') || '').split(',')[0]?.trim() || h.get('x-real-ip') || ''
  } catch { /* outside a request */ }
  await writeAuditLog({
    action,
    outcome: 'success',
    actor: actor.id,
    actorIp,
    resource,
    resourceType,
    severity,
    detail: detail ? detail.slice(0, 500) : undefined,
    user_id: actor.id,
  })
}
