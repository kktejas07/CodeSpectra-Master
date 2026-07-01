/**
 * Phase 7 shim — types preserved, runtime functions removed.
 * Use `lib/db/admin.ts` directly for the MongoDB migration.
 */

export type AdminUserListRow = {
  id: string
  email: string | null
  full_name: string | null
  name: string | null
  role: string
  status: 'active' | 'inactive'
  is_active: boolean
  last_sign_in_at: string | null
  email_confirmed_at: string | null
  created_at: string
  joinedAt: string
  lastActiveAt: string | null
  updated_at: string | null
  organization_id?: string | null
}

export type ProfileRow = {
  id: string
  email: string | null
  full_name: string | null
  role: string
  created_at: string
  updated_at: string
  username?: string | null
  organization_id?: string | null
}

/**
 * Build the admin-users grid row from a Better Auth user shim + profile row.
 * The shim only reads the fields we know exist on Better Auth's user docs.
 */
export function buildAdminUserRow(
  authUser: {
    id: string
    email?: string | null
    created_at?: string
    last_sign_in_at?: string | null
    email_confirmed_at?: string | null
    user_metadata?: { full_name?: string | null; role?: string | null }
  },
  profile: ProfileRow | undefined,
): AdminUserListRow {
  const role =
    profile?.role || authUser.user_metadata?.role || 'user'
  const fullName = profile?.full_name ?? authUser.user_metadata?.full_name ?? null
  const createdAt = profile?.created_at ?? authUser.created_at ?? new Date().toISOString()
  const lastSignIn = authUser.last_sign_in_at ?? null
  const displayName = (fullName && fullName !== 'user' && fullName !== 'User')
    ? fullName
    : (profile?.email ?? authUser.email ?? 'unknown').split('@')[0]
  return {
    id: authUser.id,
    email: profile?.email ?? authUser.email ?? null,
    full_name: fullName,
    name: displayName,
    role,
    status: 'active',
    is_active: true,
    last_sign_in_at: lastSignIn,
    lastActiveAt: lastSignIn ?? createdAt,
    email_confirmed_at: authUser.email_confirmed_at ?? null,
    created_at: createdAt,
    joinedAt: createdAt,
    updated_at: profile?.updated_at ?? null,
    organization_id: profile?.organization_id ?? null,
  }
}
