/**
 * Phase 7 stub. Original lived in the Supabase era and provisioned new
 * users via the Supabase admin API + sent welcome emails. The new
 * implementation lives inline in `app/api/admin/users/route.ts` using
 * Better Auth's `signUpEmail`; this file remains only for back-compat
 * imports and just rethrows.
 */

export type ProvisionAdminUserResult = {
  user: {
    id: string
    email: string
    full_name: string
    role: string
    created_at: string
  }
  welcomeEmailSent: boolean
  delivery: 'email' | 'none'
}

export async function provisionAdminUser(_params: {
  email: string
  full_name: string
  role: string
  adminPassword?: string
  delivery?: 'email' | 'none'
  platformName?: string
}): Promise<ProvisionAdminUserResult> {
  throw new Error(
    'provisionAdminUser was inlined into /api/admin/users in the MongoDB migration.',
  )
}
