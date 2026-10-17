/**
 * Organisation invitations: create + email, list, revoke, seat counting.
 * Accept lives in app/api/team/invitations/accept (rules in org-invitations-core).
 */
import 'server-only'
import crypto from 'crypto'
import type { Filter } from 'mongodb'
import { orgInvitations, tenants, users, nowIso, type BetterAuthUserDoc, type OrganizationInvitationDoc } from '@/lib/db/admin'
import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'
import { getAppOrigin } from '@/lib/app-origin'
import { getTenantEntitlements, checkLimit, type PlanGateError } from '@/lib/entitlements'
import { escapeHtml, INVITE_TTL_DAYS, type InviteRole } from '@/lib/org-invitations-core'
import type { APIUser } from '@/lib/route-auth'

/** Members plus still-valid pending invitations: what counts against seats. */
export async function seatsInUse(tenantId: string): Promise<number> {
  const [members, pending] = await Promise.all([
    (await users()).countDocuments({ $or: [{ tenantId }, { organizationId: tenantId }] } as Filter<BetterAuthUserDoc>),
    (await orgInvitations()).countDocuments({ organization_id: tenantId, status: 'pending', expires_at: { $gt: nowIso() } }),
  ])
  return members + pending
}

/** 402 payload when adding `n` more seats would exceed the organisation's plan. */
export async function checkSeatLimit(caller: Pick<APIUser, 'role'>, tenantId: string, n = 1): Promise<PlanGateError | null> {
  const ent = await getTenantEntitlements(tenantId)
  return checkLimit(caller, ent, 'max_seats', await seatsInUse(tenantId), n,
    'Your organisation has used all the seats on its plan. Upgrade to add more members.')
}

export async function createOrgInvitation(params: {
  tenantId: string
  email: string
  role: InviteRole
  invitedBy: { id: string; name?: string; email?: string }
}): Promise<{ invitation: Omit<OrganizationInvitationDoc, 'token'>; emailed: boolean }> {
  const col = await orgInvitations()
  const ts = nowIso()
  // One live invitation per (org, email): a resend replaces the old token.
  await col.updateMany(
    { organization_id: params.tenantId, email: params.email, status: 'pending' },
    { $set: { status: 'revoked', updated_at: ts } } as never,
  )
  const doc: OrganizationInvitationDoc = {
    id: crypto.randomUUID(),
    organization_id: params.tenantId,
    email: params.email,
    invited_by: params.invitedBy.id,
    role: params.role,
    token: crypto.randomBytes(32).toString('hex'),
    expires_at: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString(),
    status: 'pending',
    created_at: ts,
  }
  await col.insertOne(doc)

  const tenant = await (await tenants()).findOne({ id: params.tenantId }, { projection: { name: 1 } })
  let emailed = false
  try {
    const r = await sendEmail(
      params.email,
      emailTemplates.orgInvite({
        orgName: escapeHtml(tenant?.name || 'an organization'),
        invitedByName: escapeHtml(params.invitedBy.name || params.invitedBy.email || 'An admin'),
        acceptUrl: `${getAppOrigin()}/dashboard/team/invites/${doc.token}`,
      }),
    )
    emailed = !!(r as { success?: boolean } | undefined)?.success
  } catch (e) {
    console.error('[org-invitations] email failed:', e)
  }
  const { token: _t, ...safe } = doc
  return { invitation: safe, emailed }
}
