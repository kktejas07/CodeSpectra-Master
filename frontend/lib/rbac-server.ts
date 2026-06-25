'use server'

import { headers } from 'next/headers'
import { auth } from './auth'
import { normalizeUserRole, UserRole, UserWithPermissions } from './rbac'

/**
 * Get current user with role from Better Auth (SERVER ONLY).
 *
 * This is the Phase 2 replacement for the Supabase implementation. The
 * function signature and `UserWithPermissions` shape are intentionally
 * unchanged so every API route / page that imports it keeps working.
 *
 * Better Auth's `auth.api.getSession()` returns the session + user, where
 * `user` contains the additional fields we configured in `lib/auth.ts`
 * (`role`, `fullName`, `tenantId`, `organizationId`, `isActive`).
 *
 * In dev / unconfigured environments where `MONGODB_URI` is missing,
 * Better Auth will fail to read the session — we swallow that and return
 * `null` so unauthenticated pages can render their fallback states.
 */
export async function getCurrentUser(): Promise<UserWithPermissions | null> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    })

    if (!session?.user) return null

    // Better Auth typing: `user` is the framework user type plus our
    // `additionalFields`. We cast to a permissive shape to read those.
    const u = session.user as unknown as {
      id: string
      email: string
      name?: string | null
      fullName?: string | null
      role?: string | null
      tenantId?: string | null
      organizationId?: string | null
      isActive?: boolean | null
    }

    const role: UserRole = normalizeUserRole(u.role)

    return {
      id: u.id,
      email: u.email || '',
      full_name: u.fullName ?? u.name ?? null,
      role,
      is_active: u.isActive !== false,
      tenant_id: u.tenantId || u.organizationId || undefined,
    }
  } catch (error) {
    console.error('[CodeSpectra] Error fetching current user:', error)
    return null
  }
}
