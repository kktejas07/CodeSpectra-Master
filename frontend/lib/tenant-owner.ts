/**
 * SEC-036: the organisation owner — the one org admin who may make
 * organisation-wide trust decisions such as hiring-agent auto-send.
 *
 * `tenants.owner_user_id` (set when a superadmin provisions the org with its
 * first admin). Organisations created before that field: the oldest
 * organisation admin account of the tenant. Server only.
 */
import 'server-only'
import { getMongoDb } from '@/lib/mongodb'

export async function orgOwnerId(tenantId: string): Promise<string | null> {
  if (!tenantId) return null
  const db = await getMongoDb()
  const t = await db.collection('tenants').findOne({ id: tenantId }, { projection: { _id: 0, owner_user_id: 1 } })
  if (typeof t?.owner_user_id === 'string' && t.owner_user_id) return t.owner_user_id
  const oldest = await db.collection('user')
    .find({ role: 'tenant_admin', $or: [{ tenantId }, { organizationId: tenantId }] }, { projection: { _id: 1, id: 1 } })
    .sort({ createdAt: 1, _id: 1 })
    .limit(1)
    .toArray()
  const u = oldest[0]
  return u ? String(u.id || u._id) : null
}

export async function orgName(tenantId: string): Promise<string | null> {
  const db = await getMongoDb()
  const t = await db.collection('tenants').findOne({ id: tenantId }, { projection: { _id: 0, name: 1 } })
  return typeof t?.name === 'string' ? t.name : null
}
