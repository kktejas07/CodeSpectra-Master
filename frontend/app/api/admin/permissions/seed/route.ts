import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { getDefaultRolePermissions } from '@/lib/permissions-db'
import type { UserRole } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/permissions/seed
 * Seeds the roles collection with default permissions from page-permissions.ts
 */
export async function POST() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const db = await getMongoDb()
    const col = db.collection('roles')
    const now = new Date().toISOString()

    const roles: UserRole[] = ['superadmin', 'tenant_admin', 'user']
    const results: string[] = []

    for (const role of roles) {
      const permissions = getDefaultRolePermissions(role)
      const roleName =
        role === 'superadmin' ? 'Platform Admin' :
        role === 'tenant_admin' ? 'Organization Admin' : 'User'

      const existing = await col.findOne({ role })
      if (existing) {
        // Update permissions only (preserve custom changes not in defaults)
        const merged: any[] = []
        const existingPerms: Record<string, any> = {}
        for (const p of (existing.permissions || [])) {
          existingPerms[p.resource] = p
        }
        for (const p of permissions) {
          if (existingPerms[p.resource]) {
            merged.push(existingPerms[p.resource])
          } else {
            merged.push(p)
          }
        }
        await col.updateOne({ role }, {
          $set: {
            permissions: merged,
            updatedAt: now,
          }
        })
        results.push(`Updated ${role} (${permissions.length} resources, preserved custom)`)
      } else {
        await col.insertOne({
          role,
          name: roleName,
          description: `Default ${roleName} role — auto-generated`,
          permissions,
          isSystem: true,
          createdAt: now,
          updatedAt: now,
        })
        results.push(`Created ${role} (${permissions.length} resources)`)
      }
    }

    return NextResponse.json({
      message: 'Roles seeded successfully',
      results,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
