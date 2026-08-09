import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { getDefaultRolePermissions, mergePermissions } from '@/lib/permissions-db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = await getMongoDb()
    const roleDoc = await db.collection('roles').findOne({ role: user.role })
    const stored = (roleDoc?.permissions || []) as Array<{
      resource: string; actions: string[]; resourceType?: string; label?: string
    }>
    const normalizedStored: import('@/lib/permissions-db').ResourcePermission[] = stored.map(p => ({
      resource: p.resource,
      resourceType: (p.resourceType || (p.resource.startsWith('/') ? 'page' : 'entity')) as import('@/lib/permissions-db').ResourceType,
      label: p.label,
      actions: p.actions as import('@/lib/permissions-db').PermissionAction[],
    }))

    // Merge stored (DB) permissions with the static role defaults so that routes
    // added to page-permissions.ts after a role was seeded still resolve correctly.
    // Stored entries with empty actions (explicitly toggled off) override defaults.
    const merged = mergePermissions(normalizedStored, getDefaultRolePermissions(user.role))

    const pagePerms = merged.filter(
      p => p.resource === '/dashboard' || p.resource.startsWith('/dashboard/')
    )

    const readable = pagePerms
      .filter(p => p.actions.includes('read') || p.actions.includes('manage'))
      .map(p => p.resource)

    const denied = pagePerms
      .filter(p => !p.actions.includes('read') && !p.actions.includes('manage'))
      .map(p => p.resource)

    return NextResponse.json({ readable, denied })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
