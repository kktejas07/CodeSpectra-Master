import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import {
  type RoleDefinition,
  discoverAllResources,
  getDefaultRolePermissions,
  mergePermissions,
} from '@/lib/permissions-db'
import type { UserRole } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/permissions/roles — list all roles with their permissions
 */
export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const db = await getMongoDb()
    const col = db.collection('roles')
    const roles = await col.find({}).toArray()

    if (roles.length === 0) {
      return NextResponse.json({ roles: [], message: 'No roles found. Seed the database first.' })
    }

    // Enrich with auto-discovered resources
    const allResources = discoverAllResources()
    return NextResponse.json({
      roles: roles.map(r => ({
        _id: r._id,
        role: r.role,
        name: r.name,
        description: r.description,
        permissions: r.permissions || [],
        isSystem: r.isSystem || false,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      allResources,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * POST /api/admin/permissions/roles — create or update a role
 */
export async function POST(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let body: { role: string; name: string; description?: string; permissions?: any[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.role || !body.name) {
    return NextResponse.json({ error: 'role and name are required' }, { status: 400 })
  }

  try {
    const db = await getMongoDb()
    const col = db.collection('roles')

    const role: RoleDefinition = {
      role: body.role,
      name: body.name,
      description: body.description || '',
      permissions: body.permissions || [],
      isSystem: ['superadmin', 'tenant_admin', 'user'].includes(body.role),
      updatedAt: new Date().toISOString(),
    }

    const existing = await col.findOne({ role: body.role })
    if (existing) {
      await col.updateOne({ role: body.role }, { $set: role })
    } else {
      await col.insertOne({ ...role, createdAt: new Date().toISOString() })
    }

    return NextResponse.json({ role })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * GET /api/admin/permissions/check?resource=users&action=delete
 * Check if the current user has permission for an action.
 * Used by API routes for enforcement.
 */
export async function checkPermission(userId: string, resource: string, action: string): Promise<boolean> {
  try {
    const db = await getMongoDb()
    const usersCol = db.collection('users')
    const rolesCol = db.collection('roles')

    const user = await usersCol.findOne({ _id: userId })
    if (!user || !user.role) return false

    const role = await rolesCol.findOne({ role: user.role })
    if (!role) return false

    const permissions: any[] = role.permissions || []
    return permissions.some((p: any) => {
      if (!p.resource || !p.actions) return false
      const resourceMatch = p.resource === resource ||
        p.resource === `entity:${resource}` ||
        resource.startsWith((p.resource || '').replace('entity:', '') + '/')
      if (!resourceMatch) return false
      return p.actions.includes('manage') || p.actions.includes(action)
    })
  } catch {
    return false
  }
}
