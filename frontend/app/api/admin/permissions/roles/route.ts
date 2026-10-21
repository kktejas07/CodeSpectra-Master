import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { getDefaultRolePermissions, discoverAllResources } from '@/lib/permissions-db'
import { invalidatePermissionCache } from '@/lib/route-auth'
import type { UserRole } from '@/lib/rbac'
import { auditAdmin } from '@/lib/admin-audit'

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
      const systemRoles: UserRole[] = ['superadmin', 'tenant_admin', 'judge', 'user']
      const docs = systemRoles.map(role => ({
        role,
        name: role === 'superadmin' ? 'Platform Admin' : role === 'tenant_admin' ? 'Organization Admin' : role === 'judge' ? 'Judge' : 'User',
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
  } catch (e: unknown) {
    console.error('[CodeSpectra] admin/permissions/roles:', e)
    return NextResponse.json({ error: 'Something went wrong with roles. Try again.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let body: any
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
  }

  try {
    const db = await getMongoDb()
    const col = db.collection('roles')
    const now = new Date().toISOString()

    // Reseed: regenerate all system roles from defaults
    if (body.reseed) {
      const systemRoles: UserRole[] = ['superadmin', 'tenant_admin', 'judge', 'user']
      for (const role of systemRoles) {
        const defaults = getDefaultRolePermissions(role)
        const name = role === 'superadmin' ? 'Platform Admin' : role === 'tenant_admin' ? 'Organization Admin' : role === 'judge' ? 'Judge' : 'User'
        await col.updateOne({ role }, { $set: { permissions: defaults, name, description: `Default ${role} role`, updatedAt: now } })
      }
      invalidatePermissionCache()
      await auditAdmin(gate.user, 'admin.roles.reseed', 'role', 'roles/system', undefined, 'critical')
      return NextResponse.json({ message: 'System roles reseeded with defaults', roles: systemRoles })
    }

    // Create/update a single role
    if (!body.role || !body.name) {
      return NextResponse.json({ error: 'role and name are required' }, { status: 400 })
    }

    const existingPerms = body.permissions || []
    // Persist only deltas vs. the role's defaults:
    // - Explicitly edited entries (page sends `edited: true`) are always saved,
    //   so a toggled-off page stays denied and a granted page stays granted.
    // - Untouched entries are dropped when they match (or are a stale empty
    //   override of) the role default — this heals old saves that wrote `[]`
    //   for every resource, which would otherwise hide newly-added pages.
    const defaultMap = new Map(
      getDefaultRolePermissions(body.role as UserRole).map(p => [p.resource, (p.actions || [])])
    )
    const arraysEqual = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])
    const mergedPermissions = existingPerms
      .filter((p: any) => {
        if (p.edited === true) return true
        const def = defaultMap.get(p.resource) || []
        const actions = p.actions || []
        if (actions.length === 0) return def.length > 0 ? false : true
        return !arraysEqual(actions, def)
      })
      .map(({ edited: _edited, ...p }: any) => p)

    const doc = {
      role: body.role, name: body.name, description: body.description || '',
      permissions: mergedPermissions,
      isSystem: ['superadmin', 'tenant_admin', 'judge', 'user'].includes(body.role),
      updatedAt: now,
    }

    await col.updateOne({ role: body.role }, { $set: doc }, { upsert: true })
    invalidatePermissionCache()
    await auditAdmin(gate.user, 'admin.roles.update', 'role', `role/${String(body.role)}`, `${mergedPermissions.length} permission override(s)`, 'critical')
    return NextResponse.json({ role: doc })
  } catch (e: unknown) {
    console.error('[CodeSpectra] admin/permissions/roles:', e)
    return NextResponse.json({ error: 'Something went wrong with roles. Try again.' }, { status: 500 })
  }
}
