/**
 * Who manages an organisation's licences: its organisation admin (tenant_admin
 * of that tenant), or a superadmin for any org (?org=<tenant id>). Resolved from
 * the session only; an org id from the request is honoured for superadmin only.
 */
import 'server-only'
import { getAPIUser, type APIUser } from '@/lib/route-auth'

export type LicenceGate = { ok: true; user: APIUser; orgId: string | null; superadmin: boolean } | { ok: false; status: 401 | 403; code: string; error: string }

export async function licenceGate(requestedOrg?: string | null): Promise<LicenceGate> {
  const user = await getAPIUser()
  if (!user) return { ok: false, status: 401, code: 'unauthorized', error: 'Unauthorized' }
  if (user.role === 'superadmin') {
    const org = requestedOrg && /^[A-Za-z0-9_-]{1,64}$/.test(requestedOrg) ? requestedOrg : null
    return { ok: true, user, orgId: org, superadmin: true }
  }
  if (user.role === 'tenant_admin' && user.tenantId) return { ok: true, user, orgId: user.tenantId, superadmin: false }
  return { ok: false, status: 403, code: 'licence_org_admin_only', error: 'Only your organisation admin can manage licences.' }
}
