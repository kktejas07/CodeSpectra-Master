/**
 * Server-only helpers for the mobile bootstrap endpoint.
 * (Kept out of lib/mobile/manifest.ts so that file stays client-safe.)
 */
import { getMongoDb } from '@/lib/mongodb'
import { getDefaultRolePermissions, mergePermissions } from '@/lib/permissions-db'
import type { UserRole } from '@/lib/types/rbac-types'

/** DB denied web routes for a role (same merge logic as my-permissions). */
export async function getDeniedRoutesForRole(role: UserRole): Promise<string[]> {
  try {
    const db = await getMongoDb()
    const roleDoc = await db.collection('roles').findOne({ role })
    const stored = (roleDoc?.permissions || []) as Array<{
      resource: string; actions: string[]; resourceType?: string; label?: string
    }>
    const merged = mergePermissions(
      stored.map((p) => ({
        resource: p.resource,
        resourceType: (p.resourceType || (p.resource.startsWith('/') ? 'page' : 'entity')) as never,
        label: p.label,
        actions: p.actions as never[],
      })),
      getDefaultRolePermissions(role),
    )
    return merged
      .filter(
        (p) =>
          (p.resource === '/dashboard' || p.resource.startsWith('/dashboard/')) &&
          !p.actions.includes('read' as never) &&
          !p.actions.includes('manage' as never),
      )
      .map((p) => p.resource)
  } catch {
    return []
  }
}
