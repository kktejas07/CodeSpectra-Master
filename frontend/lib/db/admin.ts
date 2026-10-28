/**
 * MongoDB repositories for Phase 4: users, team/org, notifications.
 *
 * IMPORTANT: Better Auth owns the `user` collection. We read from it for
 * admin listings and write back to its additional fields (role, fullName)
 * via the `user` collection directly. Adapter-level CRUD writes for new
 * users still go through `auth.api.signUpEmail()` to keep Better Auth's
 * password hashing + `account` linkage consistent.
 */

import { type Collection, type Filter, ObjectId } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

// ---------- Document types ----------

export interface BetterAuthUserDoc {
  _id: string
  id?: string
  email: string
  emailVerified?: boolean
  name?: string | null
  image?: string | null
  createdAt: Date
  updatedAt: Date
  role?: string | null
  plan?: string | null
  fullName?: string | null
  tenantId?: string | null
  organizationId?: string | null
  isActive?: boolean | null
  lastLoginMethod?: 'google' | 'github' | 'email' | 'sso' | null
  lastLoginAt?: Date | null
  /** 'inactive' = deactivated by an admin (refused at sign-in and on every request). */
  status?: 'active' | 'inactive' | null
  /** Firebase uid linked to this account (Google / GitHub sign-in). */
  firebase_uid?: string | null
  session_version?: number
}

export interface OrganizationInvitationDoc {
  id: string
  organization_id: string
  email: string
  invited_by: string
  role: string
  token: string
  expires_at: string
  status: 'pending' | 'accepted' | 'revoked'
  created_at: string
}

export interface TenantDoc {
  id: string
  name: string
  /** Optional unique short code (auto-generated slug when omitted). */
  slug?: string
  /** Plan label attached to the tenant (e.g. enterprise). */
  plan?: string
  is_active: boolean
  created_at: string
  created_by: string
  /** SEC-036: the organisation owner (first org admin); may change auto-send. Legacy orgs: oldest org admin. */
  owner_user_id?: string | null
  member_count?: number
}

export interface AssessmentStep {
  id: string
  title: string
  target_url: string
  type: 'general' | 'identity' | 'coding' | 'cad' | 'codeathon' | 'hackathon'
  allowed_languages?: string[]
  status: 'pending' | 'in_progress' | 'completed'
}

export interface CandidateInviteDoc {
  id: string
  token: string
  /** Account id when the email already had one; null until the candidate signs up. */
  user_id: string | null
  /** First exam the invite targets (lib/exam-access checkInviteTargets). */
  exam_id?: string
  /** Inviter's tenant. */
  tenant_id?: string
  email: string
  full_name: string
  target_url: string
  assigned_assessments?: AssessmentStep[]
  allowed_languages?: string[]
  invited_by: string
  status: 'pending' | 'active' | 'used' | 'expired'
  expires_at: string
  created_at: string
  updated_at?: string | null
  postal_message_id?: number | null
  delivery_status?: 'sending' | 'sent' | 'delivered' | 'opened' | 'failed' | 'bounced' | null
  delivery_error?: string | null
  delivery_updated_at?: string | null
}

export interface UserRoleDoc {
  id: string
  user_id: string
  organization_id: string
  role: string
  joined_at: string
  is_active: boolean
}

export interface NotificationDoc {
  id: string
  user_id: string
  title: string
  message: string
  type: string
  is_read: boolean
  read_at?: string | null
  link?: string
  icon?: string
  category?: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface NotificationPreferenceDoc {
  id: string
  user_id: string
  type: string
  enabled: boolean
  categories: Record<string, boolean>
  created_at: string
  updated_at: string
}

export interface PermissionDoc {
  id: string
  name: string
  description?: string | null
  role: string
}

// ---------- Helpers (shared) ----------
export { newId, nowIso } from './ids'

// ---------- Collections ----------

export async function users(): Promise<Collection<BetterAuthUserDoc>> {
  const db = await getMongoDb()
  return db.collection<BetterAuthUserDoc>('user')
}

export async function orgInvitations(): Promise<Collection<OrganizationInvitationDoc>> {
  const db = await getMongoDb()
  return db.collection<OrganizationInvitationDoc>('organization_invitations')
}

export async function tenants(): Promise<Collection<TenantDoc>> {
  const db = await getMongoDb()
  return db.collection<TenantDoc>('tenants')
}

export async function userRoles(): Promise<Collection<UserRoleDoc>> {
  const db = await getMongoDb()
  return db.collection<UserRoleDoc>('user_roles')
}

export async function notifications(): Promise<Collection<NotificationDoc>> {
  const db = await getMongoDb()
  return db.collection<NotificationDoc>('notifications')
}

export async function notificationPreferences(): Promise<Collection<NotificationPreferenceDoc>> {
  const db = await getMongoDb()
  return db.collection<NotificationPreferenceDoc>('notification_preferences')
}

export async function permissions(): Promise<Collection<PermissionDoc>> {
  const db = await getMongoDb()
  return db.collection<PermissionDoc>('permissions')
}

export async function candidateInvites(): Promise<Collection<CandidateInviteDoc>> {
  const db = await getMongoDb()
  return db.collection<CandidateInviteDoc>('candidate_invites')
}

// ---------- User admin queries ----------

export async function listAllUsers(filter: { tenantId?: string } = {}): Promise<BetterAuthUserDoc[]> {
  const col = await users()
  const query: Record<string, unknown> = {}
  // Deny by default: a tenant filter that was asked for but is empty (a
  // tenant_admin with no tenant) matches nobody — never "every user".
  if ('tenantId' in filter) {
    if (!filter.tenantId) return []
    query.$or = [{ tenantId: filter.tenantId }, { organizationId: filter.tenantId }]
  }
  return col.find(query).sort({ createdAt: -1 }).toArray()
}

/** Fields the admin user list needs (never password hashes, 2FA secrets, face templates…). */
export const ADMIN_USER_LIST_PROJECTION = {
  _id: 1, id: 1, email: 1, name: 1, fullName: 1, role: 1, plan: 1, tenantId: 1, organizationId: 1,
  createdAt: 1, updatedAt: 1, emailVerified: 1, isActive: 1, lastLoginAt: 1, lastLoginMethod: 1,
} as const

/** Pure: Mongo filter for the admin user list (tenant scope + case-insensitive search). */
export function adminUserListFilter(opts: { tenantId?: string; search?: string | null; ids?: string[] | null }): Record<string, unknown> | null {
  const and: Record<string, unknown>[] = []
  if ('tenantId' in opts) {
    if (!opts.tenantId) return null
    and.push({ $or: [{ tenantId: opts.tenantId }, { organizationId: opts.tenantId }] })
  }
  const q = (opts.search || '').trim().slice(0, 100)
  if (q) {
    const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    and.push({ $or: [{ email: rx }, { name: rx }, { fullName: rx }] })
  }
  if (opts.ids?.length) and.push({ id: { $in: opts.ids.slice(0, 200) } })
  return and.length ? { $and: and } : {}
}

/**
 * One page of the admin user list (CORE-019): filtered and sorted in MongoDB,
 * projected, bounded. Returns the total for paging.
 */
export async function listUsersPage(opts: { tenantId?: string; search?: string | null; ids?: string[] | null; page?: number; limit?: number }): Promise<{ rows: BetterAuthUserDoc[]; total: number }> {
  const filter = adminUserListFilter(opts)
  if (!filter) return { rows: [], total: 0 }
  const limit = Math.min(1000, Math.max(1, Math.floor(opts.limit || 1000)))
  const page = Math.max(1, Math.floor(opts.page || 1))
  const col = await users()
  const [rows, total] = await Promise.all([
    col.find(filter as Filter<BetterAuthUserDoc>, { projection: ADMIN_USER_LIST_PROJECTION }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
    col.countDocuments(filter as Filter<BetterAuthUserDoc>),
  ])
  return { rows: rows as BetterAuthUserDoc[], total }
}

export async function getUserById(id: string): Promise<BetterAuthUserDoc | null> {
  const col = await users()
  const orQueries: any[] = [{ _id: id }, { id }]
  if (ObjectId.isValid(id)) orQueries.push({ _id: new ObjectId(id) })
  return col.findOne({ $or: orQueries } as Filter<BetterAuthUserDoc>)
}

export async function updateUserById(
  id: string,
  update: Partial<Pick<BetterAuthUserDoc, 'role' | 'fullName' | 'name' | 'tenantId' | 'organizationId' | 'isActive' | 'lastLoginMethod' | 'lastLoginAt'>>,
): Promise<BetterAuthUserDoc | null> {
  const col = await users()
  const $set: Record<string, unknown> = { ...update, updatedAt: new Date() }
  const orQueries: any[] = [{ _id: id }, { id }]
  if (ObjectId.isValid(id)) orQueries.push({ _id: new ObjectId(id) })
  
  await col.updateOne(
    { $or: orQueries } as Filter<BetterAuthUserDoc>,
    { $set },
  )
  return getUserById(id)
}

/**
 * Call ONLY from routes that just checked a real credential (password, OAuth
 * ID token, SSO assertion, 2FA). Also stamps `reauth_at`, which sensitive
 * actions (lib/reauth.ts) accept as "signed in recently" — SEC-011.
 * `reauthAt` lets OAuth pass the provider's auth_time instead of "now".
 */
export async function updateUserLastLogin(
  id: string,
  method: NonNullable<BetterAuthUserDoc['lastLoginMethod']>,
  opts: { reauthAt?: Date } = {},
): Promise<void> {
  const col = await users()
  const orQueries: any[] = [{ _id: id }, { id }]
  if (ObjectId.isValid(id)) orQueries.push({ _id: new ObjectId(id) })
  const now = new Date()
  await col.updateOne(
    { $or: orQueries } as Filter<BetterAuthUserDoc>,
    { $set: { lastLoginMethod: method, lastLoginAt: now, reauth_at: opts.reauthAt ?? now, updatedAt: now } as never },
  )
  // First-party analytics: sign-in event (fire-and-forget, never blocks sign-in).
  void import('@/lib/analytics/server').then(({ trackLogin }) => trackLogin(id, String(method))).catch(() => {})
}

/** Record only which method the user signed in with (no "recent sign-in" credit). */
export async function recordLoginMethod(
  id: string,
  method: NonNullable<BetterAuthUserDoc['lastLoginMethod']>,
): Promise<void> {
  const col = await users()
  const orQueries: any[] = [{ _id: id }, { id }]
  if (ObjectId.isValid(id)) orQueries.push({ _id: new ObjectId(id) })
  await col.updateOne(
    { $or: orQueries } as Filter<BetterAuthUserDoc>,
    { $set: { lastLoginMethod: method, updatedAt: new Date() } },
  )
}

export async function deleteUserById(id: string): Promise<boolean> {
  const col = await users()
  const orQueries: any[] = [{ _id: id }, { id }]
  if (ObjectId.isValid(id)) orQueries.push({ _id: new ObjectId(id) })
  const result = await col.deleteOne({
    $or: orQueries,
  } as Filter<BetterAuthUserDoc>)
  return result.deletedCount > 0
}
