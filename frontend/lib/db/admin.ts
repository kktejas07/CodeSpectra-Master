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
  user_id: string
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
  delivery_status?: 'sending' | 'delivered' | 'failed' | 'bounced' | null
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
  if (filter.tenantId) {
    query.$or = [{ tenantId: filter.tenantId }, { organizationId: filter.tenantId }]
  }
  return col.find(query).sort({ createdAt: -1 }).toArray()
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

export async function updateUserLastLogin(
  id: string,
  method: NonNullable<BetterAuthUserDoc['lastLoginMethod']>,
): Promise<void> {
  const col = await users()
  const orQueries: any[] = [{ _id: id }, { id }]
  if (ObjectId.isValid(id)) orQueries.push({ _id: new ObjectId(id) })
  await col.updateOne(
    { $or: orQueries } as Filter<BetterAuthUserDoc>,
    { $set: { lastLoginMethod: method, lastLoginAt: new Date(), updatedAt: new Date() } },
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
