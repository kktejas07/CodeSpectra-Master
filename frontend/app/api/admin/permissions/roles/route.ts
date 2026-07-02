import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { getDefaultRolePermissions, discoverAllResources } from '@/lib/permissions-db'
import { invalidatePermissionCache } from '@/lib/route-auth'
import type { UserRole } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const db = await getMongoDb()
    const col = db.collection('roles')
    let roles = await col.find({}).toArray()

    if (roles.length === 0) {
      const now = new Date().toISOString()
      const systemRoles: UserRole[] = ['superadmin', 'tenant_admin', 'user']
      const docs = systemRoles.map(role => ({
        role,
        name: role === 'superadmin' ? 'Platform Admin' : role === 'tenant_admin' ? 'Organization Admin' : 'User',
        description: `Default ${role} role`,
        permissions: getDefaultRolePermissions(role),
        isSystem: true, createdAt: now, updatedAt: now,
      }))
      await col.insertMany(docs)
      invalidatePermissionCache()
      roles = await col.find({}).toArray()
    }

    const allResources = discoverAllResources()

    return NextResponse.json({
      roles: roles.map(r => ({
        _id: r._id, role: r.role, name: r.name, description: r.description,
        permissions: r.permissions || [], isSystem: r.isSystem || false,
        createdAt: r.createdAt, updatedAt: r.updatedAt,
      })),
      allResources,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let body: any
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    const db = await getMongoDb()
    const col = db.collection('roles')
    const now = new Date().toISOString()

    // Reseed: regenerate all system roles from defaults
    if (body.reseed) {
      const systemRoles: UserRole[] = ['superadmin', 'tenant_admin', 'user']
      for (const role of systemRoles) {
        const defaults = getDefaultRolePermissions(role)
        const name = role === 'superadmin' ? 'Platform Admin' : role === 'tenant_admin' ? 'Organization Admin' : 'User'
        await col.updateOne({ role }, { $set: { permissions: defaults, name, description: `Default ${role} role`, updatedAt: now } })
      }
      invalidatePermissionCache()
      return NextResponse.json({ message: 'System roles reseeded with defaults', roles: systemRoles })
    }

    // Create/update a single role
    if (!body.role || !body.name) {
      return NextResponse.json({ error: 'role and name are required' }, { status: 400 })
    }

    const allResources = discoverAllResources()
    const existingPerms = body.permissions || []
    const mergedPermissions = allResources.map(r => {
      const existing = existingPerms.find((p: any) => p.resource === r.resource)
      return existing || { resource: r.resource, resourceType: r.resourceType, label: r.label, actions: [] }
    })

    const doc = {
      role: body.role, name: body.name, description: body.description || '',
      permissions: mergedPermissions,
      isSystem: ['superadmin', 'tenant_admin', 'user'].includes(body.role),
      updatedAt: now,
    }

    await col.updateOne({ role: body.role }, { $set: doc }, { upsert: true })
    invalidatePermissionCache()
    return NextResponse.json({ role: doc })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
