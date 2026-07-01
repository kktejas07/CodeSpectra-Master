/**
 * MongoDB repositories for Phase 4: users, team/org, notifications.
 *
 * IMPORTANT: Better Auth owns the `user` collection. We read from it for
 * admin listings and write back to its additional fields (role, fullName)
 * via the `user` collection directly. Adapter-level CRUD writes for new
 * users still go through `auth.api.signUpEmail()` to keep Better Auth's
 * password hashing + `account` linkage consistent.
 */

import { randomUUID } from 'node:crypto'
import type { Collection, Filter } from 'mongodb'
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

// ---------- Helpers ----------

export function newId(): string {
  return randomUUID()
}
export function nowIso(): string {
  return new Date().toISOString()
}

// ---------- Collections ----------

export async function users(): Promise<Collection<BetterAuthUserDoc>> {
  const db = await getMongoDb()
  return db.collection<BetterAuthUserDoc>('user')
}

export async function orgInvitations(): Promise<Collection<OrganizationInvitationDoc>> {
  const db = await getMongoDb()
  return db.collection<OrganizationInvitationDoc>('organization_invitations')
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

// ---------- User admin queries ----------

export async function listAllUsers(): Promise<BetterAuthUserDoc[]> {
  const col = await users()
  return col.find({}).sort({ createdAt: -1 }).toArray()
}

export async function getUserById(id: string): Promise<BetterAuthUserDoc | null> {
  const col = await users()
  // Better Auth stores id as _id (string). Try both fields for safety.
  return col.findOne({ $or: [{ _id: id }, { id }] } as Filter<BetterAuthUserDoc>)
}

export async function updateUserById(
  id: string,
  update: Partial<Pick<BetterAuthUserDoc, 'role' | 'fullName' | 'name' | 'tenantId' | 'organizationId' | 'isActive'>>,
): Promise<BetterAuthUserDoc | null> {
  const col = await users()
  const $set: Record<string, unknown> = { ...update, updatedAt: new Date() }
  await col.updateOne(
    { $or: [{ _id: id }, { id }] } as Filter<BetterAuthUserDoc>,
    { $set },
  )
  return getUserById(id)
}

export async function deleteUserById(id: string): Promise<boolean> {
  const col = await users()
  const result = await col.deleteOne({
    $or: [{ _id: id }, { id }],
  } as Filter<BetterAuthUserDoc>)
  return result.deletedCount > 0
}
