/**
 * Database-driven permission system.
 *
 * Permissions are stored in MongoDB `roles` collection.
 * Each role has a list of permissions: { resource, actions[] }
 *
 * Resources are auto-discovered from page-permissions.ts routes
 * and API route paths. New pages appear automatically.
 *
 * Actions: 'read' | 'create' | 'update' | 'delete' | 'manage'
 *
 * ─── How to add a new permission ───
 * 1. Add the page route to page-permissions.ts (auto-discovered)
 * 2. The role manager UI will show it as a new resource
 * 3. Assign actions (read/create/update/delete) to roles in the UI
 * 4. No code deploy needed — saved to MongoDB instantly
 */

import type { UserRole } from '@/lib/rbac'

// ─── Types ───────────────────────────────────────────────

export type PermissionAction = 'read' | 'create' | 'update' | 'delete' | 'manage'
export type ResourceType = 'page' | 'api' | 'entity'

export interface ResourcePermission {
  resource: string
  resourceType: ResourceType
  label?: string
  actions: PermissionAction[]
}

export interface RoleDefinition {
  _id?: string
  role: string
  name: string
  description?: string
  permissions: ResourcePermission[]
  isSystem?: boolean
  createdAt?: string
  updatedAt?: string
}

// ─── Resource Discovery ──────────────────────────────────

import {
  ADMIN_ONLY_ROUTES,
  TENANT_ADMIN_ROUTES,
  ALL_USER_ROUTES,
  ROUTE_LABELS,
} from '@/lib/page-permissions'

/** All known API resources (entities that have CRUD endpoints) */
const API_RESOURCES: { resource: string; label: string; actions: PermissionAction[] }[] = [
  { resource: 'users', label: 'Users', actions: ['read', 'create', 'update', 'delete'] },
  { resource: 'roles', label: 'Roles', actions: ['read', 'create', 'update', 'delete'] },
  { resource: 'problems', label: 'Problems', actions: ['read', 'create', 'update', 'delete'] },
  { resource: 'challenges', label: 'Challenges', actions: ['read', 'create', 'update', 'delete'] },
  { resource: 'tracks', label: 'Learning Tracks', actions: ['read', 'create', 'update', 'delete'] },
  { resource: 'jobs', label: 'Jobs', actions: ['read', 'create', 'update', 'delete'] },
  { resource: 'exams', label: 'Exams', actions: ['read', 'create', 'update', 'delete'] },
  { resource: 'codeathons', label: 'Codeathons', actions: ['read', 'create', 'update', 'delete'] },
  { resource: 'hackathons', label: 'Hackathons', actions: ['read', 'create', 'update', 'delete'] },
  { resource: 'certifications', label: 'Certifications', actions: ['read', 'create', 'update', 'delete'] },
  { resource: 'workflows', label: 'Workflows', actions: ['read', 'create', 'update', 'delete'] },
  { resource: 'platform_settings', label: 'Platform Settings', actions: ['read', 'update'] },
  { resource: 'server_secrets', label: 'Server Secrets', actions: ['read', 'update'] },
  { resource: 'audit_logs', label: 'Audit Logs', actions: ['read'] },
  { resource: 'analytics', label: 'Analytics', actions: ['read'] },
  { resource: 'billing', label: 'Billing', actions: ['read', 'create', 'update'] },
  { resource: 'notifications', label: 'Notifications', actions: ['read', 'create', 'update', 'delete'] },
  { resource: 'scanner', label: 'Code Scanner', actions: ['read', 'create'] },
  { resource: 'ai', label: 'AI Features', actions: ['read'] },
  { resource: 'github', label: 'GitHub Integration', actions: ['read', 'update'] },
  { resource: 'system', label: 'System / Server', actions: ['read', 'update'] },
  { resource: 'piston', label: 'Piston (Code Execution)', actions: ['read', 'update'] },
]

/**
 * Build the complete set of discoverable resources.
 */
export function discoverAllResources(): ResourcePermission[] {
  const resources: ResourcePermission[] = []

  // Page resources from route registry
  const allRoutes = [...new Set([...ADMIN_ONLY_ROUTES, ...TENANT_ADMIN_ROUTES, ...ALL_USER_ROUTES])]
  for (const route of allRoutes) {
    resources.push({
      resource: route,
      resourceType: 'page',
      label: ROUTE_LABELS[route] || route.split('/').pop() || route,
      actions: ['read'],
    })
  }

  // API entity resources
  for (const api of API_RESOURCES) {
    resources.push({
      resource: `entity:${api.resource}`,
      resourceType: 'entity',
      label: api.label,
      actions: api.actions,
    })
  }

  return resources.sort((a, b) => a.resource.localeCompare(b.resource))
}

// ─── Default Role Definitions ────────────────────────────

/**
 * Default permissions for each system role.
 * When seeding, these are used to populate the roles collection.
 */
export function getDefaultRolePermissions(role: UserRole): ResourcePermission[] {
  const allResources = discoverAllResources()
  const pageResources = allResources.filter(r => r.resourceType === 'page')
  const entityResources = allResources.filter(r => r.resourceType === 'entity')

  switch (role) {
    case 'superadmin':
      return [
        // Full page access — manage = all CRUD
        ...pageResources.filter(r =>
          ADMIN_ONLY_ROUTES.includes(r.resource) ||
          TENANT_ADMIN_ROUTES.includes(r.resource) ||
          ALL_USER_ROUTES.includes(r.resource)
        ).map(r => ({ ...r, actions: ['manage'] as PermissionAction[] })),
        // Full entity access (manage = all CRUD)
        ...entityResources.map(r => ({ ...r, actions: ['manage'] as PermissionAction[] })),
      ]

    case 'tenant_admin':
      return [
        // Team page only + all user pages
        ...pageResources.filter(r =>
          TENANT_ADMIN_ROUTES.includes(r.resource) ||
          ALL_USER_ROUTES.includes(r.resource)
        ).map(r => ({ ...r, actions: ['read'] as PermissionAction[] })),
        // Limited entity access
        ...entityResources.map(r => ({
          ...r,
          actions: (r.resource.startsWith('entity:') &&
            ['users', 'problems', 'challenges', 'tracks', 'jobs', 'exams', 'codeathons', 'notifications']
              .some(e => r.resource === `entity:${e}`))
            ? ['read', 'create', 'update'] as PermissionAction[]
            : (['billing', 'analytics', 'scanner', 'ai', 'github'].some(e => r.resource === `entity:${e}`)
              ? ['read'] as PermissionAction[]
              : [] as PermissionAction[])
        })),
      ]

    case 'user':
    default:
      return [
        // User pages only
        ...pageResources.filter(r => ALL_USER_ROUTES.includes(r.resource))
          .map(r => ({ ...r, actions: ['read'] as PermissionAction[] })),
        // Basic entity access
        ...entityResources.filter(r =>
          ['problems', 'challenges', 'tracks', 'certifications', 'scanner', 'ai', 'notifications', 'billing']
            .some(e => r.resource === `entity:${e}`)
        ).map(r => ({ ...r, actions: ['read'] as PermissionAction[] })),
      ]
  }
}

// ─── Permission Checking ─────────────────────────────────

/**
 * Check if a set of permissions allows a specific action on a resource.
 */
export function checkResourcePermission(
  permissions: ResourcePermission[],
  resource: string,
  action: PermissionAction
): boolean {
  const perm = permissions.find(p =>
    p.resource === resource ||
    p.resource === `entity:${resource}` ||
    resource.startsWith(p.resource + '/')
  )
  if (!perm) return false
  if (perm.actions.includes('manage')) return true
  return perm.actions.includes(action)
}

/**
 * Get the effective permissions for a role (merging with defaults).
 */
export function mergePermissions(
  stored: ResourcePermission[] | undefined,
  defaults: ResourcePermission[]
): ResourcePermission[] {
  if (!stored || stored.length === 0) return defaults
  const merged = new Map<string, ResourcePermission>()
  for (const p of defaults) merged.set(p.resource, { ...p })
  for (const p of stored) merged.set(p.resource, { ...p })
  return Array.from(merged.values())
}
