/**
 * ATS access (server): `ats_members`, actor resolution from the session,
 * route guards, tenant access settings, team invites and the audit trail.
 * The permission matrix and every pure rule live in lib/ats/access-rules.ts
 * (re-exported here) — read the table at the top of that file.
 *
 * Tenant selection: a user can be a member of several tenants. Routes pass the
 * `?tenant=` query param (tenantFromRequest); otherwise the `ats_tenant` cookie
 * (set by POST /api/ats/me) is a preference; otherwise the user's own
 * organisation (tenant_admin) or the most recent membership.
 */
import 'server-only'
import { cookies } from 'next/headers'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { admin2faRequiredError, getAPIUser, type APIUser } from '@/lib/route-auth'
import { deriveServerKey, isTenantActive } from '@/lib/session'
import { writeAuditLog } from '@/lib/db/misc'
import { newId, nowIso } from '@/lib/db/ids'
import { sendEmail } from '@/lib/send-email'
import { emailTemplatesFor } from '@/lib/email-templates'
import { localeForEmail } from '@/lib/i18n/recipient'
import { getAppOrigin } from '@/lib/app-origin'
import { escapeHtml } from '@/lib/org-invitations-core'
import type { AtsActor, AtsMember, AtsRole } from '@/lib/ats/contract'
import {
  DEFAULT_ACCESS_SETTINGS,
  ROLE_LABELS,
  pickMembership,
  type AtsAccessSettings,
  type MembershipChoice,
} from '@/lib/ats/access-rules'
import { ATS_INVITE_TTL_DAYS, newInviteNonce, signInviteToken, verifyInviteToken, type InviteTokenPayload } from '@/lib/ats/invite-token'
import { clientIpOrEmpty } from '@/lib/client-ip'

export * from '@/lib/ats/access-rules'

export const ATS_TENANT_COOKIE = 'ats_tenant'

/** Stored member: the contract shape plus invite bookkeeping (never sent to clients). */
export interface AtsMemberDoc extends AtsMember {
  invite_nonce?: string | null
  invite_expires_at?: string | null
  last_invited_at?: string | null
  accepted_at?: string | null
  updated_at?: string
}

export interface AtsCommentDoc {
  id: string
  tenant_id: string
  application_id: string
  job_id: string
  author_id: string
  author_name: string
  author_role: AtsRole
  visibility: 'internal' | 'client'
  body: string
  created_at: string
}

/**
 * Collection names of the other ATS parts (core / interviews). Kept here so the
 * access layer can scope reads without importing their modules.
 */
export const ATS_COLLECTIONS = {
  members: 'ats_members',
  settings: 'ats_access_settings', // separate from core's ats_settings (templates)
  comments: 'ats_comments',
  jobs: 'ats_jobs',
  applications: 'ats_applications',
  candidates: 'ats_candidates',
  clients: 'ats_clients',
  interviews: 'ats_interviews',
} as const

let _indexes: Promise<void> | null = null
function ensureIndexes(col: Collection<AtsMemberDoc>, comments: Collection<AtsCommentDoc>): Promise<void> {
  _indexes ??= Promise.all([
    col.createIndex({ tenant_id: 1, email: 1 }, { unique: true, name: 'tenant_email_unique' }),
    col.createIndex({ user_id: 1 }, { name: 'user_id' }),
    comments.createIndex({ tenant_id: 1, application_id: 1, created_at: 1 }, { name: 'tenant_app_created' }),
  ]).then(() => undefined).catch((e) => {
    _indexes = null
    console.error('[ats/access] index creation failed:', e)
  })
  return _indexes
}

export async function atsMembers(): Promise<Collection<AtsMemberDoc>> {
  const db = await getMongoDb()
  const col = db.collection<AtsMemberDoc>(ATS_COLLECTIONS.members)
  await ensureIndexes(col, db.collection<AtsCommentDoc>(ATS_COLLECTIONS.comments))
  return col
}

export async function atsComments(): Promise<Collection<AtsCommentDoc>> {
  const db = await getMongoDb()
  const col = db.collection<AtsCommentDoc>(ATS_COLLECTIONS.comments)
  await ensureIndexes(db.collection<AtsMemberDoc>(ATS_COLLECTIONS.members), col)
  return col
}

/** Raw handle on another part's collection (always filter by tenant_id). */
export async function atsCollection<T extends object = Record<string, unknown>>(name: keyof typeof ATS_COLLECTIONS): Promise<Collection<T>> {
  return (await getMongoDb()).collection<T>(ATS_COLLECTIONS[name])
}

/** Strip invite bookkeeping before sending a member to the browser. */
export function publicMember(m: AtsMemberDoc): AtsMember & { last_invited_at?: string | null; accepted_at?: string | null } {
  const { invite_nonce: _n, invite_expires_at: _e, ...rest } = m
  delete (rest as { _id?: unknown })._id
  return rest
}

// ─── Settings ───────────────────────────────────────────────────────────────

export async function getAccessSettings(tenantId: string): Promise<AtsAccessSettings> {
  try {
    const doc = await (await getMongoDb()).collection(ATS_COLLECTIONS.settings).findOne({ tenant_id: tenantId }, { projection: { access: 1 } })
    return { ...DEFAULT_ACCESS_SETTINGS, ...((doc?.access as Partial<AtsAccessSettings>) || {}) }
  } catch {
    return { ...DEFAULT_ACCESS_SETTINGS }
  }
}

export async function setAccessSettings(tenantId: string, patch: Partial<AtsAccessSettings>): Promise<AtsAccessSettings> {
  const clean: Partial<AtsAccessSettings> = {}
  if (typeof patch.recruiters_see_all_jobs === 'boolean') clean.recruiters_see_all_jobs = patch.recruiters_see_all_jobs
  if (typeof patch.client_sees_contacts === 'boolean') clean.client_sees_contacts = patch.client_sees_contacts
  const set: Record<string, unknown> = { updated_at: nowIso() }
  for (const [k, v] of Object.entries(clean)) set[`access.${k}`] = v
  await (await getMongoDb()).collection(ATS_COLLECTIONS.settings).updateOne(
    { tenant_id: tenantId },
    { $set: set, $setOnInsert: { tenant_id: tenantId, created_at: nowIso() } },
    { upsert: true },
  )
  return getAccessSettings(tenantId)
}

// ─── Actor resolution ───────────────────────────────────────────────────────

export interface MembershipSummary {
  tenant_id: string
  tenant_name: string | null
  role: AtsRole
  client_id: string | null
  org_admin: boolean
}

async function membershipChoices(user: APIUser): Promise<{ choices: MembershipChoice[]; members: AtsMemberDoc[] }> {
  const members = await (await atsMembers()).find({ user_id: user.id, status: 'active' }).limit(50).toArray()
  const choices: MembershipChoice[] = []
  if (user.role === 'tenant_admin' && user.tenantId) {
    choices.push({ tenantId: user.tenantId, role: 'admin', clientId: null, at: new Date().toISOString(), orgAdmin: true })
  }
  // Other tenants' memberships count only while that tenant is active.
  const active = new Map<string, boolean>()
  for (const m of members) {
    if (!active.has(m.tenant_id)) {
      let ok = false
      try { ok = await isTenantActive(m.tenant_id) } catch { ok = false }
      active.set(m.tenant_id, ok)
    }
    if (!active.get(m.tenant_id)) continue
    choices.push({ tenantId: m.tenant_id, role: m.role, clientId: m.client_id ?? null, at: m.accepted_at || m.created_at })
  }
  return { choices, members }
}

async function cookieTenant(): Promise<string | null> {
  try {
    const v = (await cookies()).get(ATS_TENANT_COOKIE)?.value || ''
    return /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null
  } catch {
    return null
  }
}

/** `?tenant=` from a request URL (validated), or undefined. */
export function tenantFromRequest(req: Request): string | undefined {
  try {
    const v = new URL(req.url).searchParams.get('tenant') || ''
    return /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : undefined
  } catch {
    return undefined
  }
}

async function tenantExists(tenantId: string): Promise<boolean> {
  const t = await (await getMongoDb()).collection('tenants').findOne({ id: tenantId }, { projection: { id: 1 } })
  return !!t
}

/** The ATS actor for the signed-in user in `tenantId` (or the default tenant). */
export async function getAtsActor(tenantId?: string): Promise<AtsActor | null> {
  const user = await getAPIUser()
  if (!user) return null
  return resolveActorFor(user, tenantId)
}

export async function resolveActorFor(user: APIUser, tenantId?: string): Promise<AtsActor | null> {
  const { choices, members } = await membershipChoices(user)
  const cookie = await cookieTenant()
  const superadmin = user.role === 'superadmin'
  // superadmin needs an explicit tenant: the param, or the switcher cookie.
  const requested = tenantId || (superadmin && cookie && !choices.some((c) => c.tenantId === cookie) ? cookie : null)
  const pick = pickMembership(choices, { requested, cookie, superadmin })
  if (!pick) return null
  if (superadmin && !choices.some((c) => c.tenantId === pick.tenantId) && !(await tenantExists(pick.tenantId))) return null
  const m = members.find((x) => x.tenant_id === pick.tenantId)
  return {
    userId: user.id,
    tenantId: pick.tenantId,
    role: superadmin ? 'admin' : pick.role,
    clientId: pick.role === 'client' || pick.role === 'hiring_manager' ? pick.clientId : null,
    email: (user.email || m?.email || '').toLowerCase(),
    name: user.name || m?.name || undefined,
  }
}

/** Memberships for the sidebar / tenant switcher. */
export async function listMyMemberships(user: APIUser): Promise<MembershipSummary[]> {
  const { choices } = await membershipChoices(user)
  const ids = [...new Set(choices.map((c) => c.tenantId))]
  const names = new Map<string, string>()
  if (ids.length) {
    const ts = await (await getMongoDb()).collection('tenants').find({ id: { $in: ids } }, { projection: { id: 1, name: 1 } }).toArray()
    for (const t of ts) names.set(String(t.id), String(t.name || ''))
  }
  const seen = new Set<string>()
  const out: MembershipSummary[] = []
  // org-admin entries first so they win the dedupe
  for (const c of [...choices].sort((a, b) => Number(!!b.orgAdmin) - Number(!!a.orgAdmin))) {
    if (seen.has(c.tenantId)) continue
    seen.add(c.tenantId)
    out.push({ tenant_id: c.tenantId, tenant_name: names.get(c.tenantId) || null, role: c.role, client_id: c.clientId, org_admin: !!c.orgAdmin })
  }
  return out
}

/**
 * Route guard: signed in, ATS member of the tenant, role in `roles`.
 * `roles` empty = any member.
 */
export async function requireAts(
  roles: AtsRole[],
  tenantId?: string,
): Promise<{ actor: AtsActor } | { error: string; status: number }> {
  const user = await getAPIUser()
  if (!user) return { error: 'Unauthorized', status: 401 }
  const tfa = admin2faRequiredError(user) // SEC-029
  if (tfa) return tfa
  const actor = await resolveActorFor(user, tenantId)
  if (!actor) return { error: "You're not on this organization's hiring team", status: 403 }
  if (roles.length && !roles.includes(actor.role)) return { error: "Your hiring role can't do this", status: 403 }
  return { actor }
}

/** Is the actor on the panel of an interview for this application? */
export async function isAssignedInterviewer(actor: AtsActor, applicationId: string): Promise<boolean> {
  const hit = await (await atsCollection('interviews')).findOne(
    { tenant_id: actor.tenantId, application_id: applicationId, 'panel.user_id': actor.userId },
    { projection: { id: 1 } },
  )
  return !!hit
}

// ─── Audit ──────────────────────────────────────────────────────────────────

export async function auditAts(actor: Pick<AtsActor, 'userId' | 'tenantId'>, action: string, resourceType: string, resource: string, detail?: string, req?: Request): Promise<void> {
  const ip = clientIpOrEmpty(req)
  await writeAuditLog({
    action,
    outcome: 'success',
    actor: actor.userId,
    actorIp: ip,
    resource,
    resourceType,
    severity: 'info',
    detail: detail ? detail.slice(0, 500) : undefined,
    user_id: actor.userId,
    tenant_id: actor.tenantId,
  })
}

// ─── Invites ────────────────────────────────────────────────────────────────

async function inviteKey(): Promise<Uint8Array> {
  return deriveServerKey('ats-invite')
}

export async function verifyAtsInvite(token: unknown): Promise<InviteTokenPayload | null> {
  return verifyInviteToken(await inviteKey(), token)
}

export function inviteAcceptPath(token: string): string {
  return `/hiring-invite/${encodeURIComponent(token)}`
}

/**
 * Rotate the member's invite nonce, sign a fresh link and email it. Returns
 * whether the email went out. Older links stop working.
 */
export async function sendAtsInvite(member: AtsMemberDoc, invitedBy: { name?: string; email?: string }): Promise<{ emailed: boolean }> {
  const nonce = newInviteNonce()
  const exp = Date.now() + ATS_INVITE_TTL_DAYS * 86_400_000
  const ts = nowIso()
  await (await atsMembers()).updateOne(
    { id: member.id, tenant_id: member.tenant_id },
    { $set: { invite_nonce: nonce, invite_expires_at: new Date(exp).toISOString(), last_invited_at: ts, updated_at: ts } },
  )
  const token = signInviteToken(await inviteKey(), { m: member.id, n: nonce, e: exp })
  const db = await getMongoDb()
  const [tenant, client] = await Promise.all([
    db.collection('tenants').findOne({ id: member.tenant_id }, { projection: { name: 1 } }),
    member.client_id ? db.collection(ATS_COLLECTIONS.clients).findOne({ id: member.client_id, tenant_id: member.tenant_id }, { projection: { name: 1 } }) : null,
  ])
  try {
    const r = await sendEmail(
      member.email,
      emailTemplatesFor(await localeForEmail(member.email)).atsTeamInvite({
        orgName: escapeHtml(String(tenant?.name || 'an organization')),
        invitedByName: escapeHtml(invitedBy.name || invitedBy.email || 'A recruiter'),
        roleLabel: escapeHtml(ROLE_LABELS[member.role]),
        clientName: client?.name ? escapeHtml(String(client.name)) : null,
        acceptUrl: `${getAppOrigin()}${inviteAcceptPath(token)}`,
        expiresDays: ATS_INVITE_TTL_DAYS,
      }),
      undefined,
      { category: 'transactional' },
    )
    return { emailed: !!r?.success }
  } catch (e) {
    console.error('[ats/access] invite email failed:', e)
    return { emailed: false }
  }
}

export function newMemberDoc(p: { tenantId: string; email: string; name: string | null; role: AtsRole; clientId: string | null; invitedBy: string }): AtsMemberDoc {
  const ts = nowIso()
  return {
    id: newId(),
    tenant_id: p.tenantId,
    user_id: null,
    email: p.email,
    ...(p.name ? { name: p.name } : {}),
    role: p.role,
    client_id: p.clientId,
    status: 'invited',
    invited_by: p.invitedBy,
    created_at: ts,
    updated_at: ts,
  }
}
