/**
 * Pure rules for organisation invitations (unit tested).
 */
export type InviteRole = 'user' | 'tenant_admin'

export const INVITE_TTL_DAYS = 7

/**
 * Role an invitation may carry. Tenant admins invite plain members (same
 * policy as adding members); a superadmin may invite an organisation admin.
 * Never superadmin.
 */
export function resolveInviteRole(callerRole: string, requested: unknown): InviteRole {
  const r = typeof requested === 'string' ? requested.trim().toLowerCase() : ''
  if (callerRole === 'superadmin' && r === 'tenant_admin') return 'tenant_admin'
  return 'user'
}

export type AcceptDecision =
  | { ok: true; role: string }
  | { ok: false; status: 400 | 403 | 404 | 409 | 410; error: string }

/** Decide an accept request (the caller then applies it atomically). */
export function decideAccept(input: {
  invite: { status: string; email: string; expires_at: string; role: string; organization_id: string } | null
  userEmail: string
  userRole: string
  userTenantId: string | null
  tenantActive: boolean
  now?: Date
}): AcceptDecision {
  const inv = input.invite
  const now = input.now ?? new Date()
  if (!inv || inv.status !== 'pending') return { ok: false, status: 404, error: 'Invitation not found or already used' }
  const exp = Date.parse(inv.expires_at)
  if (!Number.isFinite(exp) || exp < now.getTime()) return { ok: false, status: 410, error: 'Invitation has expired' }
  if ((inv.email || '').toLowerCase() !== (input.userEmail || '').toLowerCase()) {
    return { ok: false, status: 403, error: 'This invitation is for another account' }
  }
  if (!input.tenantActive) return { ok: false, status: 400, error: 'Organization is not active' }
  if (input.userTenantId && input.userTenantId !== inv.organization_id) {
    return { ok: false, status: 409, error: 'You already belong to another organization. Leave it first, or ask an admin to move you.' }
  }
  // A superadmin keeps their role; otherwise the invitation's role applies.
  const role = input.userRole === 'superadmin' ? 'superadmin' : inv.role === 'tenant_admin' ? 'tenant_admin' : 'user'
  return { ok: true, role }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
