/**
 * Phase 7 shim — types preserved, runtime functions removed.
 * Use `lib/db/admin.ts` directly for the MongoDB migration.
 */

export type AdminUserListRow = {
  id: string
  email: string | null
  full_name: string | null
  role: string
  is_active: boolean
  last_sign_in_at: string | null
  email_confirmed_at: string | null
  created_at: string
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
  return {
    id: authUser.id,
    email: profile?.email ?? authUser.email ?? null,
    full_name: profile?.full_name ?? authUser.user_metadata?.full_name ?? null,
    role,
    is_active: true,
    last_sign_in_at: authUser.last_sign_in_at ?? null,
    email_confirmed_at: authUser.email_confirmed_at ?? null,
    created_at: profile?.created_at ?? authUser.created_at ?? new Date().toISOString(),
    updated_at: profile?.updated_at ?? null,
    organization_id: profile?.organization_id ?? null,
  }
}
